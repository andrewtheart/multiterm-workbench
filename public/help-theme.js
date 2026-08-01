(() => {
  const requestedTheme = new URLSearchParams(window.location.search).get("theme");
  document.documentElement.dataset.theme = requestedTheme === "light" ? "light" : "dark";
})();