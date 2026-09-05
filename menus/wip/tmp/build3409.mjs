import fs from 'fs';

const entry = {
  restaurantId: '3409',
  name: 'The Coffee Bean & Tea Leaf',
  sourceUrl: 'https://coffeebean.olo.com/menu/coffee-bean-tea-leaf-carmel-mountain-plaza-san-diego',
  confidence: '',
  crossCheckedAgainst: '',
  blocked: 'Own-site link (12070 Carmel Mountain Rd store page) resolves to an Olo (serve-next) storefront whose __NEXT_DATA__ pageProps is empty -- no menu or pricing is server-rendered, and the whole app fetches client-side after mount with nothing recoverable from a plain fetch. This matches a previously logged finding for this exact chain: Coffee Bean & Tea Leaf gates all item pricing behind store-open status with no known workaround. Store hours read 7:00am-5:00pm on the store page; could not confirm current open/closed state from a script.',
  notes: 'Chain confirmed genuinely difficult per prior FINDINGS entry (Coffee Bean & Tea Leaf, Olo storefront, no workaround found). Not spending further budget on this one this wave; re-queue for a daytime attempt during posted trading hours.',
  dishes: []
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length);
