(() => {
  const platforms = {
    yahoo: {
      live: true,
      url: "https://yahoo.whotodraftnext.com/?source=public&v=20260828",
    },
  };

  function activateYahooLauncher() {
    const yahoo = document.getElementById("yahooPlatform");
    if (!yahoo || !platforms.yahoo.live) return;

    yahoo.textContent = "Yahoo · Live";
    yahoo.classList.add("live", "launchable");
    yahoo.setAttribute("role", "link");
    yahoo.setAttribute("tabindex", "0");
    yahoo.setAttribute("aria-label", "Open Yahoo draft assistant");

    const openYahoo = () => {
      const opened = window.open(platforms.yahoo.url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = platforms.yahoo.url;
    };
    yahoo.addEventListener("click", openYahoo);
    yahoo.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openYahoo();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", activateYahooLauncher);
  } else {
    activateYahooLauncher();
  }
})();
