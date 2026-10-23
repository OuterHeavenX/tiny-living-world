// Tiny Living World — data definitions for the society simulation.
// Everything here is plain data so new businesses, plots and residents can be added without code changes.

export const DAY = 1440, HOUR = 60;
export const WORK_START = 8 * 60, WORK_END = 17 * 60, WORK_MINUTES = WORK_END - WORK_START;
export const TOWNSFOLK = 90; // people from the wider town who shop in Willowbrook (the "outside" market)

/* ---------- demand groups: purchases per person per day ---------- */
export const GROUPS = {
  bakery: { label: 'baked goods', base: .55 },
  coffee: { label: 'coffee', base: .52 },
  flowers: { label: 'flowers', base: .11 },
  repairs: { label: 'repairs', base: .055 },
  books: { label: 'books', base: .07 },
  groceries: { label: 'groceries', base: .3 },
  dining: { label: 'dinners out', base: .14 },
  art: { label: 'art', base: .018 },
};
export const OUTSIDE_SHARE = .38; // relative pull of shops outside Willowbrook for every demand group

/* ---------- business categories (extensible) ---------- */
// serves: demand group -> how strongly this business competes for it
export const CATEGORIES = {
  bakery: { label: 'Bakery', serves: { bakery: 1, coffee: .12 }, price: 6.5, unitCost: 2.4, fixed: 30, wage: 44, slots: 1, open: 6, close: 15, building: 'bakery', buildDays: 4, buildCost: 5200, renoCost: 1500, startCash: 900, names: ['Sunrise Bakery', 'Golden Crust Bakery', 'Hearth & Honey Bakery'] },
  cafe: { label: 'Café', serves: { coffee: 1, bakery: .3, dining: .12 }, price: 4.6, unitCost: 1.55, fixed: 44, wage: 50, slots: 1, open: 7, close: 19, building: 'cafe', buildDays: 4, buildCost: 5600, renoCost: 1600, startCash: 1000, names: ['Corner Café', 'Bean & Bloom Café', 'The Daily Grind'] },
  florist: { label: 'Florist', serves: { flowers: 1 }, price: 16, unitCost: 6.4, fixed: 30, wage: 44, slots: 1, open: 9, close: 18, building: 'florist', buildDays: 4, buildCost: 4800, renoCost: 1300, startCash: 800, names: ['Petal & Stem', 'Wildflower Corner', 'Bloom Room'] },
  repair: { label: 'Repair shop', serves: { repairs: 1 }, price: 38, unitCost: 13, fixed: 40, wage: 60, slots: 1, open: 8, close: 17, building: 'repair', buildDays: 5, buildCost: 6000, renoCost: 2400, startCash: 900, names: ['Willowbrook Repair Co.', 'Fix-It Garage', 'Gears & Gaskets'] },
  bookstore: { label: 'Bookstore', serves: { books: 1, art: .1 }, price: 14, unitCost: 6.8, fixed: 30, wage: 44, slots: 1, open: 10, close: 19, building: 'bookstore', buildDays: 4, buildCost: 5000, renoCost: 1300, startCash: 800, names: ['Dog-Eared Books', 'The Reading Nook', 'Willow Pages'] },
  general: { label: 'General store', serves: { groceries: 1, bakery: .18, flowers: .12, books: .08 }, price: 9, unitCost: 6.3, fixed: 50, wage: 52, slots: 2, open: 7, close: 20, building: 'general', buildDays: 5, buildCost: 6400, renoCost: 1800, startCash: 1100, names: ['Willowbrook General', 'Maple Street Market', 'The Corner Store'] },
  restaurant: { label: 'Restaurant', serves: { dining: 1, coffee: .15 }, price: 19, unitCost: 8, fixed: 58, wage: 58, slots: 2, open: 11, close: 22, building: 'restaurant', buildDays: 7, buildCost: 7600, renoCost: 2600, startCash: 1300, names: ['The Willow Table', 'Lantern Kitchen', 'Blue Door Bistro'] },
  gallery: { label: 'Art gallery', serves: { art: 1 }, price: 58, unitCost: 17, fixed: 26, wage: 44, slots: 0, open: 11, close: 18, building: 'gallery', buildDays: 4, buildCost: 5400, renoCost: 1400, startCash: 600, names: ['Willowbrook Gallery', 'Studio Lily', 'Canvas & Clay'] },
};
export const HOUSE = { label: 'House', building: 'house', buildDays: 5, buildCost: 7000 };
// demolition length in work days by building size
export const DEMOLITION_DAYS = { house: 1, small: 2, large: 3.5 };

/* ---------- project phases (weights share the project's work time / budget) ---------- */
export const DEMOLITION_PHASES = [
  { key: 'approved', label: 'Demolition approved', w: 0, calendar: 120, cost: .05 },
  { key: 'fenced', label: 'Property fenced off', w: .08, cost: .1 },
  { key: 'equipment', label: 'Workers and equipment arrive', w: .08, cost: .1 },
  { key: 'dismantle', label: 'Building partially dismantled', w: .28, cost: .25 },
  { key: 'demolished', label: 'Structure demolished', w: .22, cost: .2 },
  { key: 'rubble', label: 'Rubble and debris', w: .14, cost: .1 },
  { key: 'clearing', label: 'Debris being removed', w: .2, cost: .2 },
  { key: 'cleared', label: 'Empty plot ready for development', w: 0, cost: 0 },
];
export const CONSTRUCTION_PHASES = [
  { key: 'planning', label: 'Planning', w: 0, calendar: 240, cost: .02 },
  { key: 'permits', label: 'Permits', w: 0, calendar: 0, cost: .02, permit: true },
  { key: 'siteprep', label: 'Site preparation', w: .08, cost: .06 },
  { key: 'foundation', label: 'Foundation', w: .12, cost: .12 },
  { key: 'framing', label: 'Structural framing', w: .18, cost: .18 },
  { key: 'roof', label: 'Roof and exterior', w: .18, cost: .2 },
  { key: 'windows', label: 'Windows and doors', w: .12, cost: .14 },
  { key: 'interior', label: 'Interior fit-out', w: .16, cost: .16 },
  { key: 'landscaping', label: 'Landscaping', w: .08, cost: .05 },
  { key: 'inspection', label: 'Inspection', w: .08, cost: .03 },
  { key: 'completion', label: 'Completion', w: 0, calendar: 60, cost: .01 },
  { key: 'opening', label: 'Grand opening', w: 0, opening: true, cost: 0 },
];
export const RENOVATION_PHASES = [
  { key: 'planning', label: 'Planning', w: 0, calendar: 180, cost: .05 },
  { key: 'permits', label: 'Permits', w: 0, calendar: 0, cost: .03, permit: true },
  { key: 'interior', label: 'Renovation and fit-out', w: .85, cost: .82 },
  { key: 'inspection', label: 'Inspection', w: .15, cost: .1 },
  { key: 'opening', label: 'Grand opening', w: 0, opening: true, cost: 0 },
];
export const RENOVATION_DAYS = 1.5;

/* ---------- plots (permanent; buildings and businesses come and go) ---------- */
// site = index used by the 3D world and navigation graph
export const PLOTS = [
  { id: 'P001', site: 0, address: '2 Willow Lane', x: -20, z: -20, zoning: ['residential'], size: 'house' },
  { id: 'P002', site: 1, address: '6 Willow Lane', x: -7, z: -20, zoning: ['residential'], size: 'house' },
  { id: 'P003', site: 2, address: '10 Willow Lane', x: 7, z: -20, zoning: ['residential'], size: 'house' },
  { id: 'P004', site: 3, address: '14 Willow Lane', x: 21, z: -20, zoning: ['residential'], size: 'house' },
  { id: 'P005', site: 4, address: '14 Maple Street', x: -20, z: 0, zoning: ['commercial'], size: 'small' },
  { id: 'P006', site: 5, address: 'Willowbrook Park', x: -7, z: 0, zoning: ['park'], size: 'park' },
  { id: 'P007', site: 6, address: '22 Maple Street', x: 7, z: 0, zoning: ['commercial'], size: 'small' },
  { id: 'P008', site: 7, address: '30 Maple Street', x: 21, z: 0, zoning: ['commercial', 'residential'], size: 'small' },
  { id: 'P009', site: 8, address: '1 Town Square', x: 7, z: 20, zoning: ['civic'], size: 'large' },
  { id: 'P010', site: 9, address: '5 Orchard Road', x: -6.5, z: 20.5, zoning: ['commercial', 'residential'], size: 'small' },
  { id: 'P011', site: 10, address: '21 Orchard Road', x: 22.5, z: 20.5, zoning: ['commercial', 'residential'], size: 'small' },
  { id: 'P012', site: 11, address: 'Duck Pond', x: -23, z: 21, zoning: ['park'], size: 'park' },
];
// existing buildings at the start of a new town
export const START_BUILDINGS = [
  { plot: 'P001', kind: 'house', name: 'Oliver’s Cottage', original: true },
  { plot: 'P002', kind: 'house', name: 'Emma’s House', original: true },
  { plot: 'P003', kind: 'house', name: 'Sarah’s House', original: true },
  { plot: 'P004', kind: 'house', name: 'Shared House', original: true },
  { plot: 'P005', kind: 'bakery', name: 'Sunrise Bakery', original: true },
  { plot: 'P007', kind: 'florist', name: 'Petal & Stem', original: true },
  { plot: 'P008', kind: 'cafe', name: 'Corner Café', original: true },
  { plot: 'P009', kind: 'townhall', name: 'Town Hall', original: true },
  { plot: 'P010', kind: 'garden', name: 'Community Garden', original: true, land: true },
  { plot: 'P011', kind: 'orchard', name: 'Old Orchard', original: true, land: true },
];
export const START_BUSINESSES = [
  { name: 'Sunrise Bakery', category: 'bakery', plot: 'P005', owner: 'R1', cash: 950, reputation: .95 },
  { name: 'Petal & Stem', category: 'florist', plot: 'P007', owner: 'R2', cash: 900, reputation: 1.0 },
  { name: 'Corner Café', category: 'cafe', plot: 'P008', owner: 'R5', cash: 1300, reputation: 1.0 },
];
export const START_OWNERS = { P001: 'R1', P002: 'R2', P003: 'R4', P004: 'R6', P005: 'R1', P006: 'town', P007: 'R2', P008: 'R5', P009: 'town', P010: 'town', P011: 'town', P012: 'town' };
export const START_FOR_SALE = { P011: 1.0 }; // the old orchard lot is on the market from day one

/* ---------- residents ---------- */
// traits are 0..1: ambition, sociability, frugality, kindness, risk, creativity, temper
export const PEOPLE = [
  { id: 'R1', name: 'Oliver', full: 'Oliver Hart', age: 41, occupation: 'Baker', home: 'P001', cash: 650, birthday: 12, ambition: 'best-bakery', job: { employer: 'B1', role: 'Owner' },
    traits: { ambition: .6, sociability: .65, frugality: .35, kindness: .8, risk: .4, creativity: .6, temper: .3 }, bio: 'Has baked bread on Maple Street since he was a teenager. Generous to a fault.' },
  { id: 'R2', name: 'Emma', full: 'Emma Rose', age: 29, occupation: 'Florist', home: 'P002', cash: 1500, birthday: 5, ambition: 'grow-flowers', job: { employer: 'B2', role: 'Owner' },
    traits: { ambition: .55, sociability: .8, frugality: .5, kindness: .85, risk: .35, creativity: .7, temper: .2 }, bio: 'Runs Petal & Stem and knows the name of every flower in town — and most of the people.' },
  { id: 'R3', name: 'Sarah', full: 'Sarah Quill', age: 34, occupation: 'Journalist', home: 'P003', cash: 900, birthday: 19, ambition: 'newspaper', job: { employer: 'self:paper', role: 'Editor, The Willowbrook Times' },
    traits: { ambition: .8, sociability: .55, frugality: .55, kindness: .5, risk: .55, creativity: .75, temper: .45 }, bio: 'Editor of The Willowbrook Times. Never far from a notepad.' },
  { id: 'R4', name: 'Marcus', full: 'Marcus Bell', age: 56, occupation: 'Mayor', home: 'P009', cash: 2600, birthday: 26, ambition: 'improve-town', job: { employer: 'town', role: 'Mayor' },
    traits: { ambition: .7, sociability: .75, frugality: .6, kindness: .55, risk: .3, creativity: .4, temper: .35 }, bio: 'Three-term mayor who lives above the Town Hall offices. Rents out the house on Willow Lane.' },
  { id: 'R5', name: 'Mia', full: 'Mia Santos', age: 37, occupation: 'Café owner', home: 'P008', cash: 2000, birthday: 33, ambition: 'entrepreneur', job: { employer: 'B3', role: 'Owner' },
    traits: { ambition: .85, sociability: .7, frugality: .45, kindness: .6, risk: .65, creativity: .6, temper: .4 }, bio: 'Opened Corner Café with her savings and lives in the flat upstairs.' },
  { id: 'R6', name: 'Noah', full: 'Noah Brooks', age: 31, occupation: 'Mechanic', home: 'P004', cash: 3800, birthday: 40, ambition: 'repair-shop', job: { employer: 'self:repairs', role: 'Freelance mechanic' },
    traits: { ambition: .75, sociability: .45, frugality: .85, kindness: .6, risk: .5, creativity: .5, temper: .5 }, bio: 'Fixes anything with an engine out of his driveway and saves every dollar for a garage of his own.' },
  { id: 'R7', name: 'Lily', full: 'Lily Park', age: 26, occupation: 'Artist', home: 'P004', cash: 380, birthday: 47, ambition: 'art-living', job: { employer: 'self:art', role: 'Painter' },
    traits: { ambition: .6, sociability: .65, frugality: .3, kindness: .75, risk: .6, creativity: .95, temper: .3 }, bio: 'Paints the town from park benches and rents a room in the Shared House.' },
  { id: 'R8', name: 'Ethan', full: 'Ethan Cole', age: 24, occupation: 'Bakery assistant', home: 'P004', cash: 160, birthday: 54, ambition: 'stable-career', job: { employer: 'B1', role: 'Bakery assistant' },
    traits: { ambition: .65, sociability: .6, frugality: .5, kindness: .6, risk: .45, creativity: .5, temper: .4 }, bio: 'Moved to Willowbrook looking for steady work. Helps Oliver at the bakery part-time and rents a room from Noah.' },
];
export const RENTS = { R3: { landlord: 'R4', perDay: 26 }, R7: { landlord: 'R6', perDay: 16 }, R8: { landlord: 'R6', perDay: 16 } };
export const START_TREASURY = 6000;
export const TOWN = { mayorSalary: 70, clerkWage: 64, benefit: 18, grant: 95, upkeep: 34, propertyTaxRate: .00045, salesTax: .05 };

/* ---------- ambitions: milestones are checked against the real world state ---------- */
export const AMBITIONS = {
  'best-bakery': { label: 'Run the most successful bakery in Willowbrook', milestones: ['bakery-profitable-week', 'bakery-reputation', 'bakery-hire', 'bakery-top'] },
  'grow-flowers': { label: 'Grow Petal & Stem and find someone special', milestones: ['florist-savings', 'florist-reputation', 'close-friend', 'partner'] },
  'newspaper': { label: 'Build a respected local newspaper', milestones: ['editions-10', 'scoop', 'subscribers-60', 'editions-50'] },
  'improve-town': { label: 'Improve the town and keep the public’s trust', milestones: ['approval-70', 'proposals-3', 'new-business', 'festival'] },
  'entrepreneur': { label: 'Grow her business and become a respected entrepreneur', milestones: ['cafe-savings', 'hire-employee', 'second-business', 'two-profitable'] },
  'repair-shop': { label: 'Save up and open his own repair shop', milestones: ['save-8000', 'buy-property', 'open-shop', 'shop-profitable'] },
  'art-living': { label: 'Earn a living from her art', milestones: ['sell-10', 'art-good-day', 'exhibition', 'own-gallery'] },
  'stable-career': { label: 'Find a stable job and become financially independent', milestones: ['get-job', 'keep-job-14', 'savings-1000', 'savings-3000'] },
  'fresh-start': { label: 'Make a fresh start after the business closed', milestones: ['get-job', 'keep-job-14', 'savings-1000', 'own-business'] },
  'own-business': { label: 'Open a business of their own', milestones: ['savings-3000', 'buy-property', 'open-business'] },
};
export const MILESTONE_LABELS = {
  'bakery-profitable-week': 'A full profitable week at the bakery', 'bakery-reputation': 'Bakery reputation over 105%', 'bakery-hire': 'Hire a helper', 'bakery-top': 'Top-earning business in town',
  'florist-savings': 'Florist savings over $2,500', 'florist-reputation': 'Florist reputation over 110%', 'close-friend': 'Make a close friend', 'partner': 'Find a partner',
  'editions-10': 'Publish 10 editions', 'scoop': 'Break a major story', 'subscribers-60': 'Reach 60 subscribers', 'editions-50': 'Publish 50 editions',
  'approval-70': 'Approval rating of 70%', 'proposals-3': 'Pass three town improvements', 'new-business': 'See a new business open', 'festival': 'Host a town festival',
  'cafe-savings': 'Café savings over $3,500', 'hire-employee': 'Hire an employee', 'second-business': 'Open a second business', 'two-profitable': 'Two profitable businesses',
  'save-8000': 'Save $8,000', 'buy-property': 'Buy a commercial property', 'open-shop': 'Open a repair shop', 'shop-profitable': 'Repair shop turns a profit',
  'sell-10': 'Sell 10 artworks', 'art-good-day': 'Earn $120 from art in a day', 'exhibition': 'Show work at an exhibition', 'own-gallery': 'Open a gallery',
  'get-job': 'Get a job', 'keep-job-14': 'Keep a job for two weeks', 'savings-1000': 'Save $1,000', 'savings-3000': 'Save $3,000',
  'open-business': 'Open a business', 'own-business': 'Own a business again',
};
// which business category each ambition leans toward when buying property
export const AMBITION_CATEGORY = { 'repair-shop': 'repair', 'art-living': 'gallery', 'entrepreneur': null, 'own-business': null };
