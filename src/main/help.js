const { dialog, shell } = require('electron');
const i18n = require('../shared/i18n');

const PROJECT_URL = 'https://github.com/686f6c61/whatsapp-dual';
const CHANGELOG_URL = `${PROJECT_URL}/blob/main/CHANGELOG.md`;
const ISSUES_URL = `${PROJECT_URL}/issues/new/choose`;

function showQuickHelp(mainWindow) {
  const detail = [
    i18n.t('help.quickHelpIntro', 'The most useful actions are grouped here so you can get around the app quickly.'),
    '',
    `• ${i18n.t('help.quickHelpAccounts', 'Switch between Personal and Business instantly with Ctrl+1 and Ctrl+2.')}`,
    `• ${i18n.t('help.quickHelpSettings', 'Open Settings with Ctrl+, to change language, theme, startup behavior, and security.')}`,
    `• ${i18n.t('help.quickHelpLock', 'Enable a 4-8 digit PIN and lock the app immediately with Ctrl+L when protection is enabled.')}`,
    `• ${i18n.t('help.quickHelpTray', 'If minimize to tray is enabled, closing the main window keeps WhatsApp Dual running in the tray.')}`,
    `• ${i18n.t('help.quickHelpUpdates', 'Use the updates option to check, download, and install newer versions.')}`
  ].join('\n');

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: i18n.t('help.quickHelpTitle', 'Quick help'),
    message: i18n.t('help.quickHelpMessage', 'WhatsApp Dual essentials'),
    detail,
    buttons: [i18n.t('about.ok', 'OK')]
  });
}

function showTroubleshooting(mainWindow) {
  const detail = [
    i18n.t('help.troubleshootingIntro', 'Start with the quickest fixes before re-pairing your accounts.'),
    '',
    `• ${i18n.t('help.troubleshootingReload', 'If a view looks frozen or stale, reload the active account with Ctrl+R.')}`,
    `• ${i18n.t('help.troubleshootingLogin', 'If QR login expires or a session disconnects, re-scan the affected account.')}`,
    `• ${i18n.t('help.troubleshootingNotifications', 'If notifications are missing, confirm system notifications are allowed for WhatsApp Dual.')}`,
    `• ${i18n.t('help.troubleshootingUpdates', 'If update download is not available, install the latest package manually from the releases page.')}`,
    `• ${i18n.t('help.troubleshootingSecurity', 'If you forget the PIN, reset the protected sessions and link the accounts again.')}`
  ].join('\n');

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: i18n.t('help.troubleshootingTitle', 'Troubleshooting'),
    message: i18n.t('help.troubleshootingMessage', 'Common recovery steps'),
    detail,
    buttons: [i18n.t('about.ok', 'OK')]
  });
}

function showKeyboardShortcuts(mainWindow) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
    message: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
    detail: [
      `Ctrl+1 → ${i18n.t('menu.personal', 'Personal')}`,
      `Ctrl+2 → ${i18n.t('menu.business', 'Business')}`,
      `Ctrl+, → ${i18n.t('menu.preferences', 'Preferences')}`,
      `Ctrl+L → ${i18n.t('menu.lockNow', 'Lock now')}`,
      `Ctrl+R → ${i18n.t('menu.reload', 'Reload')}`,
      `Ctrl+Q → ${i18n.t('menu.quit', 'Quit')}`
    ].join('\n'),
    buttons: [i18n.t('about.ok', 'OK')]
  });
}

function getAboutDetail(appVersion) {
  return [
    i18n.t('about.description', 'Use WhatsApp Personal and Business in a single app.'),
    '',
    `${i18n.t('about.version', 'Version')}: ${appVersion}`,
    `${i18n.t('about.license', 'License')}: MIT`,
    `${i18n.t('about.author', 'Author')}: 686f6c61`,
    '',
    `${i18n.t('about.project', 'Project')}: ${PROJECT_URL}`,
    `${i18n.t('about.changelog', 'Changelog')}: ${CHANGELOG_URL}`
  ].join('\n');
}

function openRepository() {
  return shell.openExternal(PROJECT_URL);
}

function openChangelog() {
  return shell.openExternal(CHANGELOG_URL);
}

function openIssueTracker() {
  return shell.openExternal(ISSUES_URL);
}

module.exports = {
  getAboutDetail,
  showQuickHelp,
  showTroubleshooting,
  showKeyboardShortcuts,
  openRepository,
  openChangelog,
  openIssueTracker
};
