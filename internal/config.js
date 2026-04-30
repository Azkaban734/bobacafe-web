// Central PIN configuration — edit here, then copy MASTER_PIN and APPS
// into the <script> block at the bottom of index.html.

const MASTER_PIN = '7530';  // unlocks any card

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
