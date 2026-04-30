// Central PIN configuration for the internal portal.
// Each key matches data-app on the card. Update pins here only.
const MASTER_PIN = '7530';   // unlocks any card

const APPS = {
    'reports': {
        url:    '/internal/reports/',
        pin:    '2244',
        label:  'Отчёты',
        icon:   '📊',
    },
    'bank-statement': {
        url:    'https://bobacafe-web-bank-statement.streamlit.app/',
        pin:    '9999',
        label:  'Банковские выписки',
        icon:   '🏦',
        target: '_blank',
    },
};
