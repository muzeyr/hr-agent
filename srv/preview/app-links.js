// Links in the conversation — a request number linked to its Fiori app, a
// PDF — open in a new tab, so following one does not end the chat. The
// browser already holds the login, so the app opens as the same user.
// Injected by srv/server.ts.
(() => {
  const messages = document.getElementById("messages");
  if (!messages) return;
  messages.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      link.target = "_blank";
      link.rel = "noopener";
    },
    true,
  );
})();
