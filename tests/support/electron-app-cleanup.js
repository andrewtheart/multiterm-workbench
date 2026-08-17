async function closeElectronTestApp(electronApp) {
  if (!electronApp) return;

  const workbench = electronApp.windows().find((page) => /^https?:\/\/127\.0\.0\.1:\d+\/?$/.test(page.url()));
  if (!workbench || workbench.isClosed()) {
    await electronApp.close();
    return;
  }

  const closed = electronApp.waitForEvent("close", { timeout: 15000 });
  try {
    await workbench.evaluate(() => finishAppClose("quitClose"));
  } catch (error) {
    if (!workbench.isClosed()) throw error;
  }
  await closed;
}

module.exports = { closeElectronTestApp };