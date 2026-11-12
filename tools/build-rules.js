// Builds rules/ads.json (declarativeNetRequest static ruleset) from tools/ad-domains.txt.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'ad-domains.txt'), 'utf8');
const domains = [...new Set(src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))];

const resourceTypes = [
  'sub_frame', 'script', 'image', 'xmlhttprequest', 'media', 'ping', 'stylesheet', 'font', 'websocket', 'other',
];
const rules = domains.map((domain, i) => ({
  id: i + 1,
  priority: 1,
  action: { type: 'block' },
  condition: { requestDomains: [domain], resourceTypes },
}));

fs.writeFileSync(path.join(__dirname, '..', 'rules', 'ads.json'), JSON.stringify(rules, null, 2) + '\n');
console.log(`Wrote ${rules.length} rules to rules/ads.json`);
