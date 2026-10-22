// Harbor Goods: a made-up business for the demo. Every name, price, policy, address and number here was written for
// Keel; the phone number is from the range set aside for fiction. Its facts are kept consistent across sources, so the
// tests and the quality check grade the agent, not the information.

export const NAME = "Harbor Goods";

export const PROFILE = {
  website: "https://harbor.example",
  summary:
    "Harbor Goods is a small studio in Cornwall that makes stoneware (mugs, plates and bowls) and linen for the table and kitchen, by hand. It sells online across the UK and the EU, from its studio shop in St Brannoc, and to cafés and shops wholesale.",
  offerings: ["Handmade stoneware mugs, plates and bowls", "Linen napkins, tea towels and tablecloths", "Gift cards and gift wrapping", "Personalised mugs", "Wholesale and custom glazes for cafés and shops", "Saturday pottery workshops"],
  audience: "People furnishing their homes or buying gifts, mostly in the UK, and independent cafés, restaurants and shops.",
  tone: "Warm, plain and unhurried, like the people in the studio.",
};

export const INSTRUCTIONS =
  "You are Harbor Goods' assistant. You help customers choose pieces, and answer questions about orders, delivery, returns, breakages, care, gift cards, personalisation, the studio shop and workshops, and wholesale. Sound like the people in the studio: warm, plain and unhurried, never pushy. Give the exact prices, times and conditions that apply, and point customers to the next step (the returns form, the team, the studio's opening hours).";

export const APPEARANCE = {
  displayName: "Harbor Goods",
  welcome: ["Hello from the studio! Ask me about our pieces, your order, delivery or returns."],
  suggestions: ["How much is delivery?", "Can I return something?", "Is your stoneware dishwasher safe?", "Do you sell wholesale?"],
  color: "#0e7c66" as const,
};

export const SOURCES: { title: string; content: string }[] = [
  {
    title: "Our pieces and prices",
    content: `# Our pieces and prices

Every piece is thrown, glazed and fired by hand in our studio, so no two are quite the same: the colour and size can vary a little from the photos. Prices include UK VAT.

## Glazes
- Sea Glass: a soft green-blue.
- Driftwood: a warm grey with darker flecks.
- Slate: a deep blue-black.

## Mugs and cups
- Harbour mug, 350 ml: £18.
- Set of four Harbour mugs (one glaze or mixed): £65.
- Tide espresso cup, 90 ml: £12.

## Plates
- Side plate, 20 cm: £16.
- Dinner plate, 27 cm: £24.

## Bowls
- Cereal bowl, 16 cm: £16.
- Serving bowl, 28 cm: £42. Serving bowls are made to order and are dispatched within 2 weeks.

## Linen
Our linen is woven in Europe and cut and sewn in the studio. Colours: Natural, Sage and Ink.
- Napkins, set of four: £22.
- Tea towel: £12.
- Tablecloth, 140 × 240 cm: £68.`,
  },
  {
    title: "Delivery",
    content: `# Delivery

We dispatch orders within 2 working days (serving bowls, which are made to order, within 2 weeks). When your order leaves the studio, we email you a tracking link.

## UK
- Standard delivery: 3 to 5 working days, £4.95. Free on orders over £50.
- Express delivery: the next working day, £9.95, for orders placed before 1pm Monday to Thursday. Express orders placed after 1pm on a Thursday, or on Friday to Sunday, arrive on Tuesday.
- Click and collect from the studio shop in St Brannoc is free. Your order is ready to collect within 2 working days; we email you when it is.

## EU
- Delivery takes 5 to 8 working days and costs £14.95.
- Customs duties and taxes are included in the price at checkout, so there is nothing more to pay on delivery.

We don't deliver outside the UK and the EU yet.`,
  },
  {
    title: "Returns and refunds",
    content: `# Returns and refunds

You can return unused items in their original packaging within 30 days of delivery for a full refund to your original payment method.

- To start a return, fill in the returns form with your order number. In the UK, we then email you a prepaid label, so UK returns are free. From the EU, you pay for the return postage.
- We refund within 5 working days of receiving the return.
- For a different glaze or size, return the piece and place a new order.
- Returning a gift: whoever received it can return it within 30 days of delivery for a gift card of the same value, with the order number or the buyer's email address. We don't tell the buyer.

These can't be returned: gift cards, personalised pieces (unless they arrive broken or faulty) and pieces bought in our Seconds sale.`,
  },
  {
    title: "Breakages and faults",
    content: `# Breakages and faults

If something arrives broken or faulty, email a photo of it to hello@harbor.example within 7 days of delivery, with your order number. We send a free replacement, or a full refund if you prefer. You don't need to send the broken piece back.

Small marks, pinholes and variations in the glaze are part of handmade stoneware and aren't faults.`,
  },
  {
    title: "Caring for your pieces",
    content: `# Caring for your pieces

## Stoneware
Our stoneware is dishwasher safe and microwave safe. It isn't oven safe: sudden changes of temperature can crack it, so don't put it straight from the fridge into hot water or the microwave. All our glazes are lead-free and food safe.

## Linen
Machine wash at 40°C and tumble dry on low, or dry on the line. Linen softens with every wash. It may shrink by up to 3% the first time it's washed.`,
  },
  {
    title: "Gift cards and gift wrapping",
    content: `# Gift cards and gift wrapping

Gift cards are emailed and come in any amount from £10 to £200. They're valid for 2 years from the day they're bought, can be used online and in the studio shop, and can't be exchanged for cash. A gift card can be used over several orders until it runs out.

Gift wrapping is £3.50 per order: recyclable paper, a ribbon and a handwritten card with your message. Prices are never included in a wrapped parcel.`,
  },
  {
    title: "Personalised mugs",
    content: `# Personalised mugs

We can hand-paint initials or a short name (up to 12 characters) on any Harbour mug, for £6 per mug. Personalised mugs take 10 working days longer to dispatch. Personalised pieces can't be returned unless they arrive broken or faulty.`,
  },
  {
    title: "Orders and payment",
    content: `# Orders and payment

We accept debit and credit cards. You can change or cancel an order within 2 hours of placing it: email hello@harbor.example or call us. After that, your order may already be on its way, and you can return it once it arrives.

## Seconds sale
Twice a year, in spring and autumn, we sell pieces with small cosmetic marks at 30% off. Seconds are final sale and can't be returned. Sign up to our newsletter on the website to hear when the next one opens.`,
  },
  {
    title: "Studio shop and workshops",
    content: `# Studio shop and workshops

Our studio shop is at Harbour Studio, 4 Quay Row, St Brannoc, Cornwall. It's open Wednesday to Saturday, 10am to 5pm, and closed Sunday to Tuesday.

## Pottery workshops
On Saturday mornings, from 9:30am to 12 noon, we run a beginners' pottery workshop: you throw two pieces on the wheel, and we glaze and fire them and post them to you within 4 weeks. It costs £55 per person, for up to 8 people, and is for adults and children over 12. Book by emailing hello@harbor.example with the date and the number of people.`,
  },
  {
    title: "Wholesale and custom orders",
    content: `# Wholesale and custom orders

We supply independent cafés, restaurants and shops. Wholesale prices are 35% off our retail prices, with a minimum order of 24 pieces. Custom glazes are possible for orders of 100 pieces or more. Wholesale orders take 6 to 8 weeks to make. Leave your details with us, and our wholesale team will be in touch within 2 working days.`,
  },
  {
    title: "Contact us",
    content: `# Contact us

- Email: hello@harbor.example. We reply within 1 working day.
- Phone: 01632 960418, Monday to Friday, 9am to 5pm.
- Studio shop: Harbour Studio, 4 Quay Row, St Brannoc, Cornwall (Wednesday to Saturday, 10am to 5pm).`,
  },
];

export const QAS: { question: string; answer: string }[] = [
  { question: "Do you deliver to the United States?", answer: "Not yet: we deliver to the UK and the EU only." },
  { question: "Can I collect my order from the studio?", answer: "Yes, click and collect from the studio shop in St Brannoc is free. Your order is ready within 2 working days, and we email you when it is." },
  { question: "Are your glazes food safe?", answer: "Yes. All our glazes are lead-free and food safe." },
];

/** Tests written for the demo, beside the ones Keel writes itself: the conditions, the team, and what it doesn't know. */
export const TESTS: { name: string; persona: string; criterion: string; expectedActions?: string[] }[] = [
  {
    name: "Return after the window",
    persona: "Sam bought a set of four mugs 45 days ago, never used them, and now wants to return them. Polite but disappointed when told it's too late; asks whether anything can be done.",
    criterion: "The assistant says unused items can be returned within 30 days of delivery, so this return is outside the window, and offers to pass the request to the team rather than promising a refund.",
  },
  {
    name: "Mug arrived broken",
    persona: "Priya's Harbour mug arrived with the handle snapped off yesterday. A little upset; asks what to do and whether she has to post the broken mug back.",
    criterion: "The assistant says to email a photo with the order number within 7 days of delivery, that Harbor Goods sends a free replacement or a full refund, and that she doesn't need to send the broken mug back.",
  },
  {
    name: "Wants a person",
    persona: "Tom has a complicated question about a wedding gift list and says straight away that he wants to talk to a real person, not a bot.",
    criterion: "The assistant brings in a person from the team.",
    expectedActions: ["hand_over_to_person"],
  },
  {
    name: "Café wholesale enquiry",
    persona: "Ana runs a café and wants about 60 mugs in a custom colour. Asks about wholesale prices, the minimum order and how long it takes.",
    criterion: "The assistant says wholesale is 35% off retail with a minimum of 24 pieces, that custom glazes need 100 pieces or more (so 60 mugs can't have a custom glaze), that wholesale orders take 6 to 8 weeks, and asks for her details for the wholesale team.",
  },
  {
    name: "Something it doesn't know",
    persona: "Lee wants to know whether Harbor Goods' mugs are made with recycled clay.",
    criterion: "The assistant says plainly it isn't sure or doesn't know, offers the team, and doesn't invent an answer or say they aren't recycled.",
  },
];

/** A test of the order lookup: the order tracker's answer stands in for the order system (src/platform/demo-orders.ts). */
export const ORDER_TEST = {
  name: "Where's my order",
  persona: "Jo ordered a set of mugs a few days ago, order number HG-1043, and wants to know where it is and when it will arrive. Once told, Jo is happy and says thanks.",
  criterion: "The assistant looks the order up and says it has shipped, and when it's expected, as the order system says, without inventing a date or a tracking link.",
  expectedActions: ["look_up_order"],
};

/**
 * Sample chats, so Conversations, Analytics, Answers to add and the Helpdesk inbox have something to show: customers'
 * first messages written for the demo (each marked as a sample), answered by the real agent, dated over the last days.
 */
export const SAMPLE_CHATS: { daysAgo: number; messages: string[]; photo?: string }[] = [
  { daysAgo: 5, messages: ["How much is delivery to Bristol?", "And if I order before 1pm, can it come tomorrow?"] },
  { daysAgo: 4.6, messages: ["Where's my order HG-1043?"] },
  { daysAgo: 4, messages: ["Do you sell matching teapots?"] },
  { daysAgo: 3.4, messages: ["My Harbour mug arrived with a chip in the rim. What should I do?"] },
  { daysAgo: 2.8, messages: ["Can I put your mugs in the microwave?"] },
  { daysAgo: 2.1, messages: ["Do you make teapots to go with the mugs?"] },
  { daysAgo: 1.5, messages: ["We run a café and would like about 40 mugs. Do you sell wholesale?"] },
  { daysAgo: 1.1, messages: ["My mug arrived like this."], photo: "broken-mug.png" },
  { daysAgo: 0.9, messages: ["Is the tablecloth available in blue?"] },
  { daysAgo: 0.3, messages: ["Hi, I'd like to talk to someone about a wedding gift list, please."] },
];
