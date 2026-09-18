import { rupees as r } from "../money";
import type { ListItem } from "../registry";

/**
 * IRDAI keeps four lists. Only the first costs the patient money directly, and
 * it is the only one most people have heard of, which is why the other three
 * get a line here too.
 */
export const LIST_FRAMEWORK = [
  {
    id: "I",
    title: "List I — not payable",
    effect: "Billed by the hospital, settled by the patient. No policy covers these.",
  },
  {
    id: "II",
    title: "List II — subsumed into room charges",
    effect: "The hospital may not bill these separately. If it does, the amount is disallowed.",
  },
  {
    id: "III",
    title: "List III — subsumed into procedure charges",
    effect: "Part of the surgical fee. A separate line for them is a billing error.",
  },
  {
    id: "IV",
    title: "List IV — subsumed into treatment costs",
    effect: "Part of the cost of treatment. Again, not separately billable.",
  },
];

export const LIST_I: ListItem[] = [
  { item: "Medical records charge", group: "Administrative", typical: r(900) },
  { item: "Discharge summary duplicate copies", group: "Administrative", typical: r(300) },
  { item: "Birth or death certificate charge", group: "Administrative", typical: r(250) },
  { item: "Courier charges", group: "Administrative", typical: r(200) },
  { item: "Medico-legal case charges", group: "Administrative", typical: r(0) },
  { item: "Food charges other than the patient diet", group: "Attendant", typical: r(2400) },
  { item: "Attendant bed or extra cot charge", group: "Attendant", typical: r(1500) },
  { item: "Baby food", group: "Attendant", typical: r(0) },
  { item: "Baby utility charges", group: "Attendant", typical: r(0) },
  { item: "Toiletries, buds, caps", group: "Comfort", typical: r(600) },
  { item: "Sanitary pads", group: "Comfort", typical: r(300) },
  { item: "Mineral water", group: "Comfort", typical: r(450) },
  { item: "Laundry charges", group: "Comfort", typical: r(500) },
  { item: "Television charges", group: "Comfort", typical: r(1250) },
  { item: "Telephone charges", group: "Comfort", typical: r(150) },
  { item: "Internet and email charges", group: "Comfort", typical: r(400) },
  { item: "Barber and beauty services", group: "Comfort", typical: r(200) },
  { item: "Carry bags", group: "Comfort", typical: r(100) },
  { item: "Belts, braces and leggings", group: "Appliance", typical: r(1200) },
  { item: "Cold pack or hot pack", group: "Appliance", typical: r(350) },
];

/**
 * Four items the app used to carry in List I, which the live document files
 * elsewhere.
 *
 * IRDAI's Modification Guidelines of 27 September 2019 put admission and
 * registration in List IV, documentation and administrative charges and the
 * visitor pass in List II, and ward and theatre booking in List III. Those
 * lists do not mean "the patient pays". They mean the charge is already inside
 * the room rate, the procedure fee or the cost of treatment, so the hospital
 * may not bill it separately and the amount is disallowed if it does -- close
 * to the opposite of what List I says.
 *
 * They are kept rather than deleted because a hospital billing one of these is
 * a real and common thing, and it is the clearest example the app has of a
 * charge the insurer should refuse rather than the family absorb. They are not
 * in `LIST_I` and do not count towards `listITotal()`.
 *
 * The 2019 guidelines are still the operative document: the Master Circular of
 * 29 May 2024 repeals forty-six circulars in its Annexure-6 and this is not one
 * of them, and that circular carries no lists of its own.
 */
export const SUBSUMED_MODELLED: (ListItem & { list: "II" | "III" | "IV" })[] = [
  {
    item: "Admission and registration charge",
    group: "Administrative",
    typical: r(2500),
    list: "IV",
  },
  {
    item: "Documentation and administrative charges",
    group: "Administrative",
    typical: r(700),
    list: "II",
  },
  { item: "Attendant and visitor pass charges", group: "Attendant", typical: r(400), list: "II" },
  { item: "Ward and theatre booking charges", group: "Administrative", typical: r(0), list: "III" },
];

export const LIST_I_TOTAL = LIST_I.reduce((t, i) => t + i.typical, 0);
