import { createContext, useContext } from 'react';
import type { Lang } from '@busledger/core';

/**
 * UI strings as [English, Sesotho]. The Sesotho column is a first draft and
 * must be reviewed by a native speaker before release (README, "Translations").
 * Placeholders: {name}.
 */
const S = {
  // common
  save: ['Save', 'Boloka'],
  cancel: ['Cancel', 'Hlakola'],
  edit: ['Edit', 'Fetola'],
  done: ['Done', 'Qetile'],
  retry: ['Try again', 'Leka hape'],
  today: ['Today', 'Kajeno'],
  yesterday: ['Yesterday', 'Maobane'],
  otherDate: ['Other date', 'Letsatsi le leng'],
  dateFormatHint: ['Year-month-day, e.g. 2026-10-06', 'Selemo-khoeli-letsatsi, mohl. 2026-10-06'],
  optional: ['optional', 'ha e hlokahale'],
  required: ['Fill this in.', 'Tlatsa sena.'],

  // tabs and titles
  tabHome: ['Home', 'Lapeng'],
  tabStudents: ['Students', 'Liithuti'],
  tabReports: ['Reports', 'Litlaleho'],
  tabSettings: ['Settings', 'Litlhophiso'],
  recordPayment: ['Record payment', 'Ngolisa tefo'],

  // dashboard (FR-020)
  studentsCount: ['{n} active students', 'Liithuti tse {n} tse sebetsang'],
  paid: ['Paid', 'Ba lefile'],
  partial: ['Part paid', 'Ba lefile karolo'],
  unpaid: ['Not paid', 'Ha ba so lefe'],
  cancelled: ['Not charged', 'Ha ba lefisoe'],
  expected: ['Expected for {month}', 'E lebelletsoeng bakeng sa {month}'],
  recordedFor: ['Recorded for {month}', 'E ngolisitsoeng bakeng sa {month}'],
  outstandingFor: ['Still owed for {month}', 'E ntseng e kolotoa bakeng sa {month}'],
  arrearsEarlier: ['Overdue from earlier months', 'E salletseng ea likhoeli tse fetileng'],
  receivedIn: ['Cash received in {month}', 'Chelete e amohetsoeng ka {month}'],
  creditHeld: ['Paid ahead (credit)', 'E lefetsoeng esale pele'],
  provisionalNote: ['Includes records not yet confirmed online.', 'Ho kenyeletsa tse so netefatsoeng inthaneteng.'],
  mostOverdue: ['Most overdue', 'Ba salletsoeng haholo'],
  nobodyOverdue: ['Nobody is overdue.', 'Ha ho ea salletsoeng.'],
  seeAll: ['See all students', 'Bona liithuti tsohle'],

  // statuses
  stPaid: ['Paid', 'E lefiloe'],
  stPartial: ['Part paid', 'E lefiloe karolo'],
  stUnpaid: ['Not paid', 'Ha e so lefuoe'],
  stCancelled: ['Not charged', 'Ha e lefisoe'],
  accCurrent: ['Up to date', 'O lefile tsohle'],
  accArrears: ['Overdue', 'O salletsoe'],
  accAdvance: ['Paid ahead', 'O lefile esale pele'],
  inactive: ['Left', 'O tlohile'],
  daysOverdue: ['{n} days overdue', 'Matsatsi a {n} a fetile'],
  notConfirmed: ['Not yet confirmed online', 'Ha e so netefatsoe inthaneteng'],

  // students list
  searchStudents: ['Search name, parent or phone', 'Batla ka lebitso, motsoali kapa nomoro'],
  filterAll: ['All', 'Bohle'],
  filterOwing: ['Owing', 'Ba kolotang'],
  filterUpToDate: ['Up to date', 'Ba lefileng'],
  filterLeft: ['Left', 'Ba tlohileng'],
  addStudent: ['Add student', 'Kenya seithuti'],
  noStudents: ['No students yet. Add your first student to start recording payments.', 'Ha ho liithuti. Kenya seithuti sa pele ho qala ho ngolisa litefo.'],
  noMatches: ['No student matches “{q}”.', 'Ha ho seithuti se tšoanang le “{q}”.'],

  // student form (FR-004, FR-005)
  studentName: ['Student name', 'Lebitso la seithuti'],
  parentName: ['Parent or guardian', 'Motsoali kapa mohlokomeli'],
  parentPhone: ["Parent's phone", 'Nomoro ea motsoali'],
  phoneInvalid: ['Enter a Lesotho number with 8 digits, e.g. 5812 3456.', 'Kenya nomoro ea Lesotho ea linomoro tse 8, mohl. 5812 3456.'],
  school: ['School', 'Sekolo'],
  pickup: ['Pickup place', 'Moo a nkuoang teng'],
  dropoff: ['Drop-off place', 'Moo a theoloang teng'],
  monthlyFee: ['Monthly fee (M)', 'Tefo ea khoeli (M)'],
  startDate: ['Start date', 'Letsatsi la ho qala'],
  firstMonthCharge: ['Charge for {month}', 'Tefo ea {month}'],
  choiceFull: ['Full fee', 'Tefo e felletseng'],
  choiceHalf: ['Half fee', 'Halofo'],
  choiceFree: ['Free', 'Mahala'],
  choiceCustom: ['Other amount', 'Chelete e ngoe'],
  suggested: ['suggested', 'e khothalletsoang'],
  feeChangeNote: ['The new fee applies from next month. Months already charged stay the same.', 'Tefo e ncha e qala khoeling e tlang. Likhoeli tse seng li lefisitsoe ha li fetohe.'],
  saveStudent: ['Save student', 'Boloka seithuti'],

  // student account (FR-021)
  owes: ['Owes', 'O kolota'],
  aheadBy: ['Paid ahead by', 'O lefile esale pele ka'],
  nothingOwed: ['Nothing owed', 'Ha a kolote letho'],
  months: ['Months', 'Likhoeli'],
  paymentsTitle: ['Payments', 'Litefo'],
  noPayments: ['No payments recorded yet.', 'Ha ho tefo e ngolisitsoeng.'],
  recordedOf: ['{a} of {b}', '{a} ho {b}'],
  sendReminder: ['Send reminder', 'Romela khopotso'],
  settleCredit: ['Settle credit', 'Lokisa chelete e lefetsoeng esale pele'],
  studentLeft: ['Student has left', 'Seithuti se tlohile'],
  makeActive: ['Make active again', 'Khutlisetsa seithuti'],
  dontCharge: ["Don't charge this month", 'Se lefise khoeli ena'],
  chargeAgain: ['Charge this month again', 'Lefisa khoeli ena hape'],
  leftCreditPrompt: ['{name} has {amount} paid ahead. Record what happened to it.', '{name} o na le {amount} e lefetsoeng esale pele. Ngola hore na e entsoe joang.'],
  creditAdjustmentLabel: ['Credit settled', 'Chelete e lokisitsoe'],

  // record payment (FR-011, FR-014)
  whoPaid: ['Who paid?', 'Ke mang ea lefileng?'],
  change: ['Change', 'Fetola'],
  amount: ['Amount (M)', 'Chelete (M)'],
  amountInvalid: ['Enter an amount above zero, like 500 or 500.50.', 'Kenya chelete e kaholimo ho zero, joalo ka 500 kapa 500.50.'],
  fullFee: ['Monthly fee', 'Tefo ea khoeli'],
  allOwed: ['All owed', 'Tsohle tse kolotoang'],
  howPaid: ['How was it paid?', 'E lefiloe joang?'],
  datePaid: ['Date paid', 'Letsatsi la tefo'],
  reference: ['Reference', 'Nomoro ea tšupiso'],
  note: ['Note', 'Tlhaloso'],
  checkBeforeSaving: ['Check before saving', 'Hlahloba pele u boloka'],
  saveRecord: ['Save record', 'Boloka rekoto'],
  notMoney: ['This records money you already received. The app never sends or receives money.', 'Sena se ngolisa chelete eo u seng u e amohetse. App ena ha e romele kapa ho amohela chelete.'],
  afterSaving: ['After saving: {name} {state}', 'Ka mor’a ho boloka: {name} {state}'],
  willOwe: ['will owe {amount}', 'o tla kolota {amount}'],
  willBeAhead: ['will be {amount} ahead', 'o tla be a lefile {amount} esale pele'],
  willBeClear: ['will owe nothing', 'a ke ke a kolota letho'],

  // acknowledgement (FR-022..FR-024)
  paymentRecorded: ['Payment recorded', 'Tefo e ngolisitsoe'],
  sendWhatsApp: ['Send on WhatsApp', 'Romela ka WhatsApp'],
  sharePdf: ['Share as PDF', 'Arolelana e le PDF'],
  acknowledgement: ['Acknowledgement', 'Netefatso'],

  // payment detail (FR-016)
  voidRecord: ['Void this record', 'Etsa hore rekoto ena e se sebetse'],
  correctRecord: ['Correct this record', 'Lokisa rekoto ena'],
  voidReason: ['Why is it being voided?', 'Hobaneng e etsoa hore e se sebetse?'],
  voidConfirm: ['Void record', 'Tiisa'],
  voided: ['Voided', 'Ha e sebetse'],
  voidExplain: ['The record stays in the history, marked void. Its amount stops counting toward the balance.', 'Rekoto e lula historing, e tšoailoe. Chelete ea eona ha e sa baloa.'],
  correctExplain: ['The original is voided and a corrected record is saved in its place. Both stay in the history.', 'Ea pele e etsoa hore e se sebetse, ’me e lokisitsoeng ea bolokoa. Ka bobeli li lula historing.'],
  correction: ['Correction of {n}', 'Tokiso ea {n}'],
  allocatedTo: ['Counted toward', 'E baliloe ho'],
  creditPart: ['paid ahead', 'esale pele'],

  // credit adjustment (FR-039)
  available: ['Available credit: {amount}', 'Chelete e lefetsoeng esale pele: {amount}'],
  adjRefunded: ['Money returned to parent', 'Chelete e khutliselitsoe motsoali'],
  adjWrittenOff: ['Written off', 'E tlohetsoe'],
  adjOther: ['Other', 'Tse ling'],
  adjReason: ['What happened?', 'Ho etsahetse eng?'],
  adjTooMuch: ['That is more than the available credit.', 'Sena se feta chelete e teng.'],
  saveAdjustment: ['Save', 'Boloka'],

  // reminders (FR-025)
  reminderTitle: ['Reminder to {name}', 'Khopotso ho {name}'],
  instructions: ['Add a note, e.g. how to pay you', 'Eketsa tlhaloso, mohl. hore na u lefuoa joang'],
  openWhatsApp: ['Open in WhatsApp', 'Bula ho WhatsApp'],
  reminderInfo: ['WhatsApp opens with this message. You send it yourself.', 'WhatsApp e tla buleha le molaetsa ona. U o romela ka bowena.'],
  nothingToRemind: ['Nothing is owed, so there is nothing to remind about.', 'Ha ho letho le kolotoang.'],
  language: ['Language', 'Puo'],

  // reports (FR-026..FR-029)
  day: ['Day', 'Letsatsi'],
  month: ['Month', 'Khoeli'],
  recordsCount: ['{n} records', 'Lirekoto tse {n}'],
  totalRecorded: ['Total recorded', 'Kakaretso e ngolisitsoeng'],
  byMethod: ['By method', 'Ka mokhoa'],
  noRecordsDay: ['No payments recorded on this day.', 'Ha ho tefo e ngolisitsoeng letsatsing lena.'],
  history: ['Payment history', 'Histori ea litefo'],
  exportCsv: ['Export to spreadsheet (CSV)', 'Romela ho spreadsheet (CSV)'],
  exportStudents: ['Students', 'Liithuti'],
  exportPayments: ['Payments', 'Litefo'],
  exportCredit: ['Credit settled', 'Chelete e lokisitsoeng'],

  // settings (NFR-010)
  business: ['Business name', 'Lebitso la khoebo'],
  yourName: ['Your name', 'Lebitso la hau'],
  dueDay: ['Fees due on day', 'Tefo e lefuoa ka letsatsi'],
  graceDays: ['Days of grace before overdue', 'Matsatsi pele e salla morao'],
  methods: ['Payment methods', 'Mekhoa ea tefo'],
  methodsHint: ['One per line', 'O le mong moleng ka mong'],
  settingsOnline: ['Settings are saved online. Connect to the internet to change them.', 'Litlhophiso li bolokoa inthaneteng. Hokela inthanete ho li fetola.'],
  lockAfter: ['Ask for PIN after {n} minutes away', 'Kopa PIN ka mor’a metsotso e {n}'],
  signOut: ['Sign out', 'Tsoa'],
  signOutPending: ['{n} records have not synced. Signing out deletes them from this phone. Sync first.', 'Lirekoto tse {n} ha li so hokahanngoe. Ho tsoa ho tla li hlakola fonong ena. Hokahanya pele.'],
  closeAccount: ['Close account', 'Koala akhaonto'],
  closeAccountInfo: ['Your records are kept for 90 days, then deleted for good. Export them first.', 'Lirekoto li bolokoa matsatsi a 90, ebe lia hlakoloa. Li romele pele.'],
  appVersion: ['Version {v}', 'Phetolelo {v}'],

  // sync (FR-032..FR-034)
  syncNow: ['Sync now', 'Hokahanya hona joale'],
  syncing: ['Syncing…', 'E ea hokahanya…'],
  lastSynced: ['Synced {when}', 'E hokahantsoe {when}'],
  neverSynced: ['Not synced yet', 'Ha e so hokahanngoe'],
  pendingCount: ['{n} waiting to sync', 'Tse {n} li emetse ho hokahanngoa'],
  failedCount: ['{n} could not sync', 'Tse {n} ha lia khona ho hokahanngoa'],
  offline7: ['Not synced for {n} days. Connect to the internet soon so your records are backed up.', 'Ha e so hokahanngoe matsatsi a {n}. Hokela inthanete kapele hore lirekoto li bolokehe.'],
  offline30: ['Not synced for {n} days. These records exist only on this phone until you connect.', 'Ha e so hokahanngoe matsatsi a {n}. Lirekoto tsena li fonong ena feela ho fihlela u hokela.'],
  signInToSync: ['Sign in again to keep syncing.', 'Kena hape ho tsoela pele ho hokahanya.'],
  syncStatus: ['Sync status', 'Boemo ba ho hokahanya'],
  synced: ['Synced', 'E hokahantsoe'],
  pending: ['Waiting', 'E emetse'],
  failed: ['Could not sync', 'Ha ea hokahanngoa'],
  allSynced: ['Everything is synced.', 'Tsohle li hokahantsoe.'],
  justNow: ['just now', 'hona joale'],
  minutesAgo: ['{n} min ago', 'metsotso e {n} e fetileng'],
  hoursAgo: ['{n} h ago', 'lihora tse {n} tse fetileng'],
  daysAgo: ['{n} days ago', 'matsatsi a {n} a fetileng'],
  couldNotReach: ['Could not reach the server. Your records are safe on this phone.', 'Ha ea fihlella seva. Lirekoto li bolokehile fonong ena.'],

  // auth (FR-001..FR-003)
  welcome: ['Keep your school bus payment records in one place.', 'Boloka lirekoto tsa litefo tsa bese ea sekolo sebakeng se le seng.'],
  signIn: ['Sign in', 'Kena'],
  createAccount: ['Create account', 'Bula akhaonto'],
  haveAccount: ['I already have an account', 'Ke se ke na le akhaonto'],
  newHere: ['Create a new account', 'Bula akhaonto e ncha'],
  phone: ['Phone number', 'Nomoro ea mohala'],
  pin: ['PIN (6 to 8 digits)', 'PIN (linomoro tse 6 ho isa ho 8)'],
  forgotPin: ['Forgot PIN?', 'U lebetse PIN?'],
  sendCode: ['Send code by SMS', 'Romela khoutu ka SMS'],
  smsCode: ['6-digit code from SMS', 'Khoutu ea linomoro tse 6'],
  newPin: ['New PIN (6 to 8 digits)', 'PIN e ncha'],
  setPin: ['Set new PIN', 'Beha PIN e ncha'],
  codeSent: ['If this number has an account, a code is on its way.', 'Haeba nomoro ena e na le akhaonto, khoutu e tla fihla.'],
  unlockTitle: ['Enter your PIN', 'Kenya PIN ea hau'],
  unlock: ['Unlock', 'Bula'],
  wrongPin: ['That PIN is wrong.', 'PIN eo ha e nepahale.'],
  needInternetFirst: ['Connect to the internet to sign in for the first time.', 'Hokela inthanete ho kena lekhetlo la pele.'],
  balanceChanged: ['The balance is now {amount}. The acknowledgement keeps the figure from when it was made.', 'Chelete e kolotoang joale ke {amount}. Netefatso e boloka palo ea nakong eo e entsoeng.'],
  moreDetails: ['Add reference or note', 'Eketsa nomoro ea tšupiso kapa tlhaloso'],
  kindStudent: ['Student', 'Seithuti'],
  kindPeriod: ['Month', 'Khoeli'],
  kindPayment: ['Payment', 'Tefo'],
  kindAdjustment: ['Credit settled', 'Chelete e lokisitsoeng'],
  kindAck: ['Acknowledgement', 'Netefatso'],
  forgotPinLocked: ['Forgot your PIN? Sign out and sign in again with a new PIN.', 'U lebetse PIN? Tsoa ebe u kena hape ka PIN e ncha.'],
  // welcome (Tsela-Tšoeu)
  appSubtitle: ['School transport management', 'Tsamaiso ea lipalangoang tsa sekolo'],
  tagline1: ['Every student.', 'Seithuti se seng le se seng.'],
  tagline2: ['Every payment. Accounted for.', 'Tefo e ngoe le e ngoe e ngotsoe.'],
  welcomeBody: ['A simple and reliable way for school transport drivers to manage students, track payments, and stay in control.', 'Mokhoa o bonolo le o tšepahalang oa hore bakhanni ba lipalangoang tsa sekolo ba hlokomele liithuti, ba latele litefo, ’me ba laole tsohle.'],
  featStudents: ['Manage students', 'Laola liithuti'],
  featPayments: ['Track payments', 'Latela litefo'],
  featReports: ['View reports', 'Bona litlaleho'],
  getStarted: ['Get started', 'Qala'],
  logIn: ['Log in', 'Kena'],
  back: ['Back', 'Khutla'],
  footerLine: ['Driven by people, powered by purpose.', 'E tsamaisoa ke batho, e matlafatsoa ke sepheo.'],

  // billing rules
  billingRules: ['Billing rules', 'Melao ea tefo'],
  billingRulesHint: ['These decide how new months are charged. Months already charged stay as they are.', 'Melao ena e laola hore likhoeli tse ncha li lefisoa joang. Likhoeli tse seng li lefisitsoe ha li fetohe.'],
  firstMonthTitle: ['First month for a new student', 'Khoeli ea pele ea seithuti se secha'],
  fmFull: ['Always the full fee', 'Kamehla tefo e felletseng'],
  fmAsk: ['I choose each time', 'Ke ikhethela nako le nako'],
  fmHalf: ['Half fee from a set day', 'Halofo ho tloha letsatsing le itseng'],
  fmProrata: ['Only the school days left', 'Matsatsi a sekolo a setseng feela'],
  cutoffDay: ['Half fee if they start on or after day', 'Halofo haeba ba qala ka letsatsi lena kapa ka mor’a lona'],
  holidayTitle: ['Months with school holidays', 'Likhoeli tse nang le matsatsi a phomolo'],
  hrSame: ['Same fee every month', 'Tefo e tšoanang khoeli le khoeli'],
  hrByDays: ['Charge by days the bus runs', 'Lefisa ka matsatsi ao bese e sebetsang'],
  hrHalfOrAsk: ['Full fee if the bus runs half the month or more; otherwise I decide', 'Tefo e felletseng haeba bese e sebetsa halofo ea khoeli kapa ho feta; ho seng joalo kea etsa qeto'],
  calendars: ['School holidays', 'Matsatsi a phomolo a sekolo'],
  calendarsHint: ['Add the dates each school is closed. Weekends are already left out.', 'Kenya matsatsi ao sekolo ka seng se koetsoeng. Mafelo-beke ha a baloe.'],
  allSchools: ['All schools', 'Likolo tsohle'],
  whichSchool: ['Which school?', 'Sekolo sefe?'],
  addClosure: ['Add holiday', 'Kenya phomolo'],
  closureLabel: ['Name, e.g. Winter holidays', 'Lebitso, mohl. Phomolo ea mariha'],
  closedFrom: ['First day closed', 'Letsatsi la pele le koetsoeng'],
  closedTo: ['Last day closed', 'Letsatsi la ho qetela le koetsoeng'],
  toBeforeFrom: ['The last day must be on or after the first day.', 'Letsatsi la ho qetela le tlameha ho ba ka mor’a la pele.'],
  removeClosure: ['Remove', 'Tlosa'],
  noClosures: ['No holidays added yet.', 'Ha ho phomolo e kentsoeng.'],
  saveRules: ['Save billing rules', 'Boloka melao ea tefo'],
  saved: ['Saved.', 'E bolokiloe.'],

  // months to decide
  reviewTitle: ['Months to decide', 'Likhoeli tse emetseng qeto'],
  reviewBanner: ['{n} holiday months need your decision', 'Likhoeli tse {n} tsa phomolo li emetse qeto ea hau'],
  reviewHint: ['The bus runs less than half of these months. Choose what to charge.', 'Bese e sebetsa ka tlase ho halofo ea likhoeli tsena. Khetha seo u se lefisang.'],
  daysRun: ['{open} of {normal} school days', 'Matsatsi a sekolo a {open} ho a {normal}'],
  noSchool: ['No school set', 'Ha ho sekolo'],
  allFull: ['Full fee for all', 'Tefo e felletseng ho bohle'],
  allByDays: ['By days for all', 'Ka matsatsi ho bohle'],
  allFree: ['Free for all', 'Mahala ho bohle'],
  holidayReason: ['Holiday month: {choice}', 'Khoeli ea phomolo: {choice}'],
  nothingToReview: ['Nothing to decide.', 'Ha ho letho le emetseng qeto.'],

  // change a month's charge
  changeCharge: ['Change charge', 'Fetola tefo'],
  chargeFor: ['Charge for {month}', 'Tefo ea {month}'],
  currentCharge: ['Now {amount}', 'Hona joale {amount}'],
  changeReason: ['Why are you changing it?', 'Hobaneng u e fetola?'],
  saveCharge: ['Save charge', 'Boloka tefo'],
  chargeExplain: ['The change is kept in the history with your reason.', 'Phetoho e bolokoa historing hammoho le lebaka la hau.'],
  notStarted: ['Not started', 'Ha e so qale'],
  choiceProrata: ['School days left', 'Matsatsi a setseng'],
} as const satisfies Record<string, readonly [string, string]>;

export type StringKey = keyof typeof S;

export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = S[key][lang === 'st' ? 1 : 0];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function useT() {
  const { lang } = useContext(LangContext);
  return { lang, t: (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
