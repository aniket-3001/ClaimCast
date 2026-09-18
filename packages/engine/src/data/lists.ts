import { rupees as r } from "../money";
import type { Paise } from "../money";

export interface ListItem {
  item: string;
  group: string;
  /** Illustrative amount on a five-day admission at a metro hospital. */
  typical: Paise;
}

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
  { item: "Admission and registration charge", group: "Administrative", typical: r(2500) },
  { item: "Medical records charge", group: "Administrative", typical: r(900) },
  { item: "Documentation and administrative charges", group: "Administrative", typical: r(700) },
  { item: "Discharge summary duplicate copies", group: "Administrative", typical: r(300) },
  { item: "Birth or death certificate charge", group: "Administrative", typical: r(250) },
  { item: "Courier charges", group: "Administrative", typical: r(200) },
  { item: "Medico-legal case charges", group: "Administrative", typical: r(0) },
  { item: "Ward and theatre booking charges", group: "Administrative", typical: r(0) },
  { item: "Attendant and visitor pass charges", group: "Attendant", typical: r(400) },
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

export const LIST_I_TOTAL = LIST_I.reduce((t, i) => t + i.typical, 0);
