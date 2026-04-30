// Central PIN configuration for the internal portal.
// Each key matches data-app on the card. Update pins here only.
const APPS = {
    'schedule': {
        url:    '/internal/schedule/',
        pin:    '2233',
        label:  'График работы',
        icon:   '📅',
    },
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
