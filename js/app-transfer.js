/* =========================================================
   APP TRANSFER — "Transferir dados" (login nativo Google, dentro do app)
   =========================================================
   Chamado pelo menu hambúrguer da splash (ver js/splash.js), só faz
   sentido rodando dentro do app Android via Capacitor.

   IMPORTANTE: login nativo, NÃO signInWithPopup do SDK web (o popup do
   Google não funciona bem dentro da WebView do app). Usamos um plugin
   nativo do Capacitor pra pegar o idToken e então autenticamos no
   Firebase com esse token via signInWithCredential.

   Suporta tanto @codetrix-studio/capacitor-google-auth quanto
   @capacitor-firebase/authentication (o que estiver instalado no
   projeto). Pré-requisitos fora deste arquivo (ver README da migração):
     - OAuth Client ID Android criado no Google Cloud Console do
       projeto Firebase "box-football-2021";
     - SHA-1 do keystore de assinatura registrado no Firebase Console;
     - google-services.json em android/app/;
     - plugin instalado e configurado (capacitor.config + AndroidManifest).

   Depende de: js/transfer-limit.js (checkTransferLimit/
   incrementTransferCount/formatResetDate), js/cloud-save.js
   (loadStateFromCloud), js/ui-dialog.js (showConfirmDialog/
   showInfoDialog), js/state.js (SAVE_KEY).
   ========================================================= */

function appTransferLog(...args) {
  console.log("[app-transfer]", ...args);
}

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Pega um idToken do Google via qualquer um dos dois plugins nativos
 *  suportados. Lança erro se nenhum estiver disponível/configurado. */
async function _nativeGoogleSignIn() {
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};

  // Opção 1: @codetrix-studio/capacitor-google-auth
  if (plugins.GoogleAuth && typeof plugins.GoogleAuth.signIn === "function") {
    const result = await plugins.GoogleAuth.signIn();
    const idToken = result && result.authentication && result.authentication.idToken;
    if (idToken) return idToken;
  }

  // Opção 2: @capacitor-firebase/authentication
  if (plugins.FirebaseAuthentication && typeof plugins.FirebaseAuthentication.signInWithGoogle === "function") {
    const result = await plugins.FirebaseAuthentication.signInWithGoogle();
    const idToken = result && result.credential && result.credential.idToken;
    if (idToken) return idToken;
  }

  throw new Error("Nenhum plugin de login nativo do Google disponível/configurado.");
}

/** Fluxo completo de "Transferir dados", chamado pelo menu da splash. */
async function startDataTransferFlow() {
  if (!isNativeApp()) {
    appTransferLog("Ignorado: só funciona dentro do app.");
    return;
  }

  try {
    const idToken = await _nativeGoogleSignIn();
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    const result = await firebase.auth().signInWithCredential(credential);
    const uid = result.user.uid;

    const limit = await checkTransferLimit(uid);
    if (!limit.permitido) {
      await showInfoDialog(
        "Limite de transferências atingido",
        `Você atingiu o limite de 10 transferências neste mês. Ele reseta em ${formatResetDate(limit.resetaEm)}.`
      );
      return;
    }

    const cloudSave = await loadStateFromCloud(uid);
    if (!cloudSave) {
      await showInfoDialog("Nada encontrado", "Nenhum progresso encontrado pra essa conta.");
      return;
    }

    const email = result.user.email || "essa conta";
    const confirmed = await showConfirmDialog(
      "Progresso encontrado",
      `Encontramos um progresso salvo em ${email}. Deseja importar? Isso vai substituir o progresso atual deste app.`,
      "Importar",
      "Cancelar"
    );
    if (!confirmed) return;

    localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSave));
    await incrementTransferCount(uid);
    location.reload();
  } catch (err) {
    appTransferLog("Falha na transferência de dados:", err && err.message);
    if (typeof toast === "function") {
      toast("Não deu pra transferir os dados agora. Tenta de novo em instantes.", "");
    }
  }
}
