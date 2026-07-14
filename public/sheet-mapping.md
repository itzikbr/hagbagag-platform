# מסמך מיפוי — דף ביצוע (חג בגג)

> מסמך מקיף של טופס דף הביצוע: כל השדות, הקבועים, מבנה מסד הנתונים וזרימת הניווט.
> נבנה מקריאה מלאה של הקוד בתאריך 14.7.2026. מיועד למילוי נתונים ללא צורך לחזור לקוד.

**קבצי מקור:**
- `src/pages/NewExecutionSheet.tsx` — טופס יצירה/עריכה (3+1 לשוניות)
- `src/pages/ExecutionSheetsList.tsx` — רשימת דפי ביצוע
- `src/pages/ExecutionSheetView.tsx` — מסך צפייה (read-only)

**Supabase:** פרויקט `HAGBAGAB_BITZUA` · `edsivltyzrfjrjhwfbid` · region ap-northeast-2 (סיאול)

---

## 1. סקירה כללית של הטופס

הטופס (`NewExecutionSheet`) בנוי מ-4 לשוניות (`TabKey`):

| מפתח לשונית | תווית מוצגת | תיאור |
|---|---|---|
| `details` | פרטים | פרטי לקוח, מאפיינים כלליים, לוגיסטיקה, סוגי עבודה + בלוקים דינמיים |
| `docs` | תיעוד | תמונות שטח / סקיצה / מסמכים |
| `materials` | חומרים | קטגוריות חומרים (נגזרות מסוגי העבודה) |
| `progress` | 🚦 התקדמות | היתר אסבסט, ספקים, תכנון ביצוע, סיכום |

**התנהגות שמירה:**
- שמירה אוטומטית (autosave) עם debounce של 2000ms (`AUTOSAVE_MS`), פעילה רק כשהטופס "משמעותי" (`meaningful`): יש שם לקוח **או** כתובת **או** לפחות סוג עבודה אחד.
- כפתורי פוטר: **שמור טיוטה** (`status='field'`) · **✓ אישור ושמירה** (`status='submitted'`, מנווט ל-`/sheets`).
- כל בקשת שמירה עטופה ב-`withTimeout` (15 שניות).
- העלאת תמונות דורשת קודם שמירת הדף (`ensureSheetId`).

**מבנה אחסון הנתונים:**
- טבלת `execution_sheets` = ה-header (שם, תאריך, סטטוס, progress_data, מראה אסבסט).
- טבלת `buildings` = שורה אחת (building_number=1) עם `work_content` (jsonb — כל הטופס) ו-`materials` (jsonb).
- כל הטופס נשמר תחת `buildings.work_content` כ-JSONB. ראה סעיף 8.

---

## 2. קבועים (Constants) — כל הרשימות והערכים

### 2.1 צבעים ומספרים
| קבוע | ערך |
|---|---|
| `RED` | `#CC0000` (אדום ראשי בטופס) |
| `GREY` | `#8696A0` |
| `BG` | `#F2EDE9` |
| `BORDER` | `#E5E0DB` |
| `AUTOSAVE_MS` | `2000` |
| `ASB_RED` | `#c0392b` (אדום בלוק החלפת אסבסט) |
| `HEADER_RED` (View) | `#c0392b` |
| `SECTION_BG` (View) | `#e8d5d3` |
| `SECTION_COLOR` (View) | `#7b2d26` |

### 2.2 רשימות בחירה כלליות
| קבוע | ערכים |
|---|---|
| `FILLERS` (ממלא הדף) | עמאד, סמיר, עלי, אסף, דליה, מוטי, איציק |
| `ROOF_TYPES` (סוג גג) | חד שיפועי, דו שיפועי, רב שיפועי, אחר |
| `CONSTRUCTIONS` (קונסטרוקציה) | עץ, מתכת, אחר |
| `GENERAL_CHIPS` (צ'יפים מאפיינים) | דוד שמש, קולטים, פאנלים סולריים, מזגנים, ארובה, פטרית איזור, חלון תאורה, אנטנות, אחר |
| `CRANE_OPTS` (מנוף) | לא נדרש, קצר, ארוך, אחר |
| `CONTAINER_OPTS` (מכולה) | לא נדרש, 10m³, 20m³, 30m³ |
| `LIFT_OPTS` (במת הרמה) | לא נדרש, דיזל, חשמלית |
| `ARM_OPTS` (זרוע/מספריים) | לא נדרש, מספריים, זרוע |
| `ACCESS_OPTS` (גישה לאתר) | קלה, מוגבלת, קשה, ללא גישה |
| `LOGISTICS_CHIPS` (צ'יפים לוגיסטיקה) | פנויה, עצים, חשמל, דרך צרה, אחר |
| `ROOF_HEIGHT_OPTS` (גובה גג) | נמוך עד 3מ׳, בינוני 3-6מ׳, גבוה 6מ׳+ |

### 2.3 רשימות "החלפת גג" (roofReplace)
| קבוע | ערכים |
|---|---|
| `EXISTING_ROOF_OPTS` (גג קיים) | איסכורית, אסבסט, רעפים, פנלים, שינגלס, אחר |
| `NEW_ROOF_OPTS` (גג חדש) | איסכורית, פנל מבודד, רעפים, שינגלס, אחר |
| `SHEET_THICKNESS_OPTS` (עובי פח) | 0.4, 0.5, 0.55, 0.6, 0.75 |
| `FILL_TYPE_OPTS` (סוג מילוי) | פוליסטירן, צמר סלעים, פוליסטירן מחוזק, אחר |
| `TILE_TYPE_OPTS` (סוג רעף) | חרס, אקרשטיין, אחר |
| `ROOF_COLOR_OPTS` (צבע גג) | לבן, שנהב, אדום רעפים, חום, אפור בהיר, אפור כהה, ירוק, כחול, גלוון, אחר |

### 2.4 רשימות אלומיניום / מרזבים / בידוד
| קבוע | ערכים |
|---|---|
| `ALUM_SHADES` (גוון אלומיניום) | חום, פולי סנדר, מהגוני, לבן, קרם, אפור, ירוק, אחר |
| `GUTTER_TYPES` (סוג מרזב) | חיצוני, פנימי, חיצוני ופנימי, אחר |
| `INSULATION_TYPE_OPTS` (סוג בידוד) | רדיד אלומיניום, צמר סלעים, צמר זכוכית, אחר |
| `INSULATION_THICKNESS_OPTS` (עובי בידוד) | 5 סמ, 8 סמ, 10 סמ, 12 סמ, אחר |

### 2.5 רשימות "סוג" בלשונית חומרים
| קבוע | ערכים | קטגוריה |
|---|---|---|
| `ROOFING_MAT_OPTS` | איסכורית, פנל מבודד, רעפים, אחר | קירוי (roofing) |
| `FLASHING_MAT_OPTS` | רוכב, סוגר חזית, סוגר צד, כובע, פלשונג עליון פתוח, פלשונג צד 90°, אחר | פחחות (flashing) |
| `GUTTER_MAT_OPTS` | פנימי, חיצוני, ירידות מרזב, אחר | מרזבים (gutters) |
| `ALUM_MAT_OPTS` | 4 לוחות, 3 לוחות, 2 לוחות, פח פרוס, יו, אחר | אלומיניום (aluminum) |
| `WOOD_MAT_OPTS` | לטות, 5×5, 5×10, 5×15, אחר | עץ (wood) |
| `RIDER_TYPE_OPTS` (סוג רוכב) | שטוח, טרפזי | מופיע כשסוג=רוכב בפחחות |
| `MAT_TYPE_OPTS` | מיפוי: flashing→FLASHING, gutters→GUTTER, aluminum→ALUM, wood→WOOD | (roofing ו-insulation ללא dropdown-סוג) |

### 2.6 רשימות בלוק "החלפת אסבסט" (asbestos)
| קבוע | ערכים | שדה |
|---|---|---|
| `ASB_STRUCTURE_OPTS` | סככה פתוחה, סככה סגורה, מגורים, מחסן, אחר | סוג מבנה |
| `ASB_CONSTRUCTION_OPTS` | בטון, מתכת, עץ, אחר | קונסטרוקציה |
| `ASB_CEILING_TYPE_OPTS` | בטון, רביץ, גבס, צפה, אחר | סוג תקרה |
| `ASB_SUB_OPTS` | קנלטות, מוקצף, אחר | סוג (כשאסבסט=אחר) |
| `ASB_CONS_STATE_OPTS` | תקינה, חלשה | מצב קונס' |
| `ASB_YESNO` | אין, יש | מקל סבא / תקרה קשיחה |
| `ASB_INFRA_OPTS` | קיימת, חדשה | תשתית |
| `ASB_KIND_OPTS` | רגיל, אחר | סוג אסבסט |
| `ASB_NEWROOF_OPTS` | ללא, איסכורית, פנל מבודד, אחר | קירוי חדש |

### 2.7 רשימות לשונית "התקדמות" (progress)
| קבוע | ערכים |
|---|---|
| `PERMIT_SUPERVISORS` (מפקח היתר) | עמאד, סמיר, עלי, אסף, איציק |
| `ROOFING_SUPPLIERS` (ספק קירוי) | הגן הנדסה, אופק, פוליפח, א.ד פלדות, מבנה דרום, אחר |
| `ALL_SUPPLIERS` (כל הספקים) | הגן הנדסה, אופק, פוליפח, א.ד פלדות, מבנה דרום, אחים שחם, כראדי, פסקל, מטלום, עץ ועצה, אלי לבן, נוימן, אחר |
| `TEAM_LEADS` (ראש צוות) | עמאד, סמיר, עלי |
| `SUBCONTRACTORS` (קבלן משנה) | זכי, מאלק, חאזם, וויסאם, מחמוד, האני, גל, אחר |

### 2.8 סוגי עבודה (`WORK_TYPES`)
מוצגים כרשת כפתורים (בחירה מרובה). המפתח (`key`) נשמר במערך `workTypes`.

| key | label (תווית) |
|---|---|
| `asbestos` | 🟠 החלפת אסבסט |
| `roofReplace` | 🏠 החלפת גג |
| `aluminum` | 🔩 ציפוי אלומיניום |
| `gutters` | 🌧️ מרזבים |
| `insulation` | 🧊 בידוד |
| `other` | 📝 אחר |

> ב-View הקבוע `WORK_TYPE_LABEL` זהה (asbestos = "🟠 החלפת אסבסט").

### 2.9 מטא-דאטה קטגוריות חומרים (`CATEGORY_META`)
`CATEGORY_ORDER` = `['aluminum','roofing','flashing','wood','gutters','insulation']`

| key | label | color | head (רקע) | hasShade | roofSub | unit |
|---|---|---|---|---|---|---|
| `aluminum` | חיפוי אלומיניום | #1A5FAD | #EBF2FC | ✓ | ✗ | מ׳ |
| `flashing` | פחחות | #B8540A | #FDF0E8 | ✗ | ✗ | מ"א |
| `roofing` | קירוי | #1A7A3A | #E8F5EC | ✗ | ✓ | מ"א |
| `wood` | עץ | #7A4F1A | #F5EFE6 | ✗ | ✗ | מ"א |
| `gutters` | מרזבים | #2C6B8A | #E8F2F5 | ✗ | ✗ | מ׳ |
| `insulation` | בידוד | #7A4CA0 | #F0EBF5 | ✗ | ✗ | מ"ר |

**נגזרות קטגוריות מסוגי עבודה** (`derivedCategories`): תמיד `flashing` פעיל. בנוסף:
- `roofReplace` → מוסיף `roofing` + `flashing`
- `aluminum` → מוסיף `aluminum` + `flashing`
- `gutters` → מוסיף `gutters`
- `insulation` → מוסיף `insulation`

(הוספה בלבד — הסרת קטגוריה היא ידנית. ברירת מחדל בטופס חדש: `active=['flashing']`.)

---

## 3. לשונית "פרטים" (details)

### 3.1 כרטיס "פרטים" (`DetailsTab` / `form.details`)
| תווית | שדה בקוד | סוג | אפשרויות/הערות |
|---|---|---|---|
| תאריך | `date` | date | ברירת מחדל: היום (`todayISO`) |
| ממלא הדף | `fillerName` | dropdown | `FILLERS` |
| הזמנה מס׳ | `orderNumber` | text | maxLength 12 |
| שם לקוח | `customerName` | text | — |
| כתובת | `address` | text | — |
| טלפון | `phones` | string[] | מערך דינמי (＋/− להוספה/הסרה); type=tel |
| הכנה סולרי | `solarPrep` | boolean | צ'יפ כן/לא (`YesNoChip`) |

### 3.2 כרטיס "מאפיינים כלליים" (`GeneralProps` / `form.general`)
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| גובה גג | `roofHeight` | dropdown | `ROOF_HEIGHT_OPTS` |
| שטח (מ״ר) | `area` | number | — |
| סוג גג | `roofType` | dropdown+אחר | `ROOF_TYPES` · okey=`gen.roofType` |
| קונסטרוקציה | `construction` | dropdown+אחר | `CONSTRUCTIONS` · okey=`gen.construction` |
| (צ'יפים) | `chips` | string[] | `GENERAL_CHIPS` (בחירה מרובה) |

### 3.3 כרטיס "לוגיסטיקה" (`Logistics` / `form.logistics`)
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| מנוף | `crane` | dropdown+אחר | `CRANE_OPTS` · okey=`log.crane` |
| מכולה | `container` | dropdown | `CONTAINER_OPTS` |
| במת הרמה | `lift` | dropdown | `LIFT_OPTS` |
| זרוע/מספריים | `arm` | dropdown | `ARM_OPTS` |
| גישה לאתר | `access` | dropdown | `ACCESS_OPTS` |
| גובה עבודה (מ׳) | `workHeight` | number | — |
| (צ'יפים) | `chips` | string[] | `LOGISTICS_CHIPS` (בחירה מרובה) |

### 3.4 כרטיס "סוג עבודה"
בחירה מרובה מ-`WORK_TYPES` (סעיף 2.8). לכל סוג נבחר מוצג בלוק דינמי (`WorkBlock`) — סעיף 4.

> יש גם כפתור "＋ הוסף מבנה נוסף" בתחתית הלשונית שמציג `alert('בקרוב')` — לא פעיל.

---

## 4. בלוקים דינמיים לפי סוג עבודה (`form.blocks`)

כל בלוק מופיע רק כשסוג העבודה שלו נבחר. נשמרים תחת `work_content.blocks.<key>`.

### 4.1 בלוק "החלפת אסבסט" — `blocks.asbestos` (`AsbestosBlock`)
בלוק **רב-מבנים**. מבנה:
```
AsbestosBlock {
  buildings: AsbestosBuilding[]   // לפחות 1
  generalNote: string; generalNoteOpen: boolean   // הערה כללית לפרויקט
  sensitive: string;   sensitiveOpen: boolean      // מבנים רגישים
}
```

**כל כרטיס מבנה** (`AsbestosBuilding`) — שדות:
| תווית | שדה בקוד | סוג | אפשרויות/הערות |
|---|---|---|---|
| מבנה N | (idx) | תווית | ממוספר אוטומטית |
| מקל סבא | `grandpaStick` | צ'יפ יחיד | `ASB_YESNO` (אין/יש) |
| נ.צ. X | `coordX` | text | — |
| נ.צ. Y | `coordY` | text | — |
| גודל גג (מ"ר) | `roofSize` | number | נכנס לסיכום שטח כולל |
| סוג מבנה | `structureType` (+`structureTypeOther`) | dropdown+אחר inline | `ASB_STRUCTURE_OPTS` |
| קונסטרוקציה | `construction` (+`constructionOther`) | dropdown+אחר inline | `ASB_CONSTRUCTION_OPTS` |
| גובה (מ') | `height` | number | — |
| מצב קונס' | `consState` | צ'יפ יחיד | `ASB_CONS_STATE_OPTS` (תקינה/חלשה) |
| תקרה קשיחה | `ceiling` | צ'יפ יחיד | `ASB_YESNO` (אין/יש) |
| סוג תקרה | `ceilingType` (+`ceilingTypeOther`) | MiniSelect+אחר inline | `ASB_CEILING_TYPE_OPTS` · מופיע רק כש`ceiling='יש'` |
| תשתית | `infra` | צ'יפ יחיד | `ASB_INFRA_OPTS` (קיימת/חדשה) |
| סוג אסבסט | `asbestosKind` | צ'יפ יחיד | `ASB_KIND_OPTS` (רגיל/אחר) |
| סוג | `asbestosSub` (+`asbestosSubOther`) | MiniSelect+אחר inline | `ASB_SUB_OPTS` · מופיע רק כש`asbestosKind='אחר'` |
| קירוי חדש | `newRoof` (+`newRoofNote`) | צ'יפ יחיד + text | `ASB_NEWROOF_OPTS` · שדה פירוט מופיע כשנבחר ≠ "ללא" |
| הערה למבנה | `note` (+`noteOpen`) | textarea | נפתח בכפתור "＋ הערה" בכותרת הכרטיס |

**פוטר הבלוק:** כפתור "＋ הוסף מבנה" · שורת סיכום `{שטח כולל} מ"ר · {N} מבנים` · כפתורי "＋ הערה" (→`generalNote`) ו"＋ מבנים רגישים" (→`sensitive`). כפתור הסרת מבנה (✕) מופיע רק כשיש יותר ממבנה אחד.

> **שדות "אחר" נשמרים inline באובייקט המבנה** (לא במפת `others`), כי המבנים דינמיים.
> `normalizeAsbestos` ממיר מבנה ישן (שדה בודד: coordX/usedFor/ceiling/...) לכרטיס מבנה אחד בטעינה.

### 4.2 בלוק "החלפת גג" — `blocks.roofReplace` (`RoofReplaceBlock`)
| תווית | שדה בקוד | סוג | אפשרויות · okey |
|---|---|---|---|
| גג קיים | `existingRoof` | dropdown+אחר | `EXISTING_ROOF_OPTS` · `rr.existingRoof` |
| גג חדש | `newRoof` | dropdown+אחר | `NEW_ROOF_OPTS` · `rr.newRoof` |
| קונסטרוקציה | `construction` | dropdown+אחר | `CONSTRUCTIONS` · `rr.construction` |
| שיפוע | `slope` | text | — |
| בליטה מהפתות | `overhang` | number | — |
| הערה | `overhangNote` | text | הערה לשדה הבליטה בלבד |
| עובי פח | `sheetThickness` | dropdown | `SHEET_THICKNESS_OPTS` · **רק כשגג חדש=איסכורית** |
| צבע | `color` | dropdown+אחר | `ROOF_COLOR_OPTS` · `rr.color` · באיסכורית/פנל מבודד |
| עובי פח עליון | `topThickness` | dropdown | `SHEET_THICKNESS_OPTS` · **רק פנל מבודד** |
| עובי פח תחתון | `bottomThickness` | dropdown | `SHEET_THICKNESS_OPTS` · **רק פנל מבודד** |
| סוג מילוי | `fillType` | dropdown+אחר | `FILL_TYPE_OPTS` · `rr.fillType` · **רק פנל מבודד** |
| סוג רעף | `tileType` | dropdown+אחר | `TILE_TYPE_OPTS` · `rr.tileType` · **רק רעפים** |

### 4.3 בלוק "ציפוי אלומיניום" — `blocks.aluminum` (`AluminumBlock`)
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| גוון | `shade` | dropdown+אחר | `ALUM_SHADES` · okey=`alum.shade` |
| מטרים | `meters` | number | — |
| מיקום | `coating` | string[] (צ'יפים) | פנים, תקרה |

### 4.4 בלוק "מרזבים" — `blocks.gutters` (`GuttersBlock`)
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| סוג | `type` | dropdown+אחר | `GUTTER_TYPES` · okey=`gut.type` |
| מרזבים (מ׳) | `guttersM` | number | — |
| מקטעים | `guttersSegments` | number | — |
| ירידות (יח׳) | `downUnits` | number | — |
| מקטעים | `downSegments` | number | — |

### 4.5 בלוק "בידוד" — `blocks.insulation` (`InsulationBlock`)
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| סוג | `type` | dropdown+אחר | `INSULATION_TYPE_OPTS` · okey=`ins.type` |
| שטח (מ״ר) | `area` | number | — |
| עובי | `thickness` | dropdown+אחר | `INSULATION_THICKNESS_OPTS` · okey=`ins.thickness` |

### 4.6 בלוק "אחר" — `blocks.other` (`OtherBlock`)
| תווית | שדה בקוד | סוג |
|---|---|---|
| פירוט | `note` | textarea |

---

## 5. לשונית "תיעוד" (docs) — `form.documentation` (`Documentation`)

שלושה סקשנים, כל אחד מערך של `DocItem`:

| סקשן | שדה בקוד | icon | כותרת משנה |
|---|---|---|---|
| תמונות שטח | `photos` | 📷 | תיעוד ויזואלי של האתר |
| סקיצה | `sketch` | ✏️ | שרטוט / סקיצת גג |
| מסמכים | `documents` | 📄 | הזמנות / אישורים / מסמכים |

**`DocItem`:** `path` (נתיב ב-storage), `url` (signed URL זמני), `name`, `note`, `noteOpen`.
- קבצים עולים ל-Storage bucket **`sheet-images`**, בנתיב `{sheetId}/{section}/{timestamp}_{filename}`.
- signed URLs נוצרים לשנה; **לא** נשמרים ב-DB (רק path/name/note — ראה `stripDoc`).
- accept=`image/*`, multiple. יש צופה תמונות מסך-מלא (`ImageViewer`) עם ניווט חיצים.

---

## 6. לשונית "חומרים" (materials) — `form.materials` (`MaterialsState`)

מבנה: `{ active: string[], data: Record<catKey, MaterialCategory> }`.
הקטגוריות הפעילות נגזרות מסוגי העבודה (סעיף 2.9), וניתן להוסיף/להסיר ידנית.

### 6.1 `MaterialCategory` — כותרת קטגוריה
| שדה בקוד | סוג | הערה |
|---|---|---|
| `rows` | MaterialRow[] | שורות פריטים |
| `roofingType` | dropdown+אחר | **קירוי בלבד** · `ROOFING_MAT_OPTS` · okey=`mat.roofing.roofingType` |
| `sheetThickness` | dropdown | קירוי=איסכורית · `SHEET_THICKNESS_OPTS` |
| `roofColor` | dropdown+אחר | קירוי=איסכורית/פנל · `ROOF_COLOR_OPTS` |
| `topThickness` / `bottomThickness` | dropdown | קירוי=פנל מבודד · `SHEET_THICKNESS_OPTS` |
| `fillType` | dropdown+אחר | (לא בשימוש בכותרת קירוי הנוכחית, קיים בטיפוס) |
| `tileType` | dropdown+אחר | קירוי=רעפים · `TILE_TYPE_OPTS` |
| `thickness`, `color` | text | שדות ישנים בטיפוס (לא מוצגים) |

### 6.2 `MaterialRow` — שורת פריט
| תווית | שדה בקוד | סוג | הערה |
|---|---|---|---|
| סוג | `type` | dropdown/text | dropdown לפי `MAT_TYPE_OPTS` (flashing/gutters/aluminum/wood); text חופשי כשאין dropdown |
| פירוט (אחר) | `typeOther` | text | כשסוג=אחר (maxLen 20, עץ=25) |
| סוג רוכב | `riderType` | dropdown | `RIDER_TYPE_OPTS` · כשסוג=רוכב (פחחות) |
| זווית | `riderAngle` | text | כשסוג=רוכב · maxLen 15 |
| גוון | `shade` | text | רק בקטגוריות עם `hasShade` (אלומיניום) |
| יח׳ | `qty` | number | כמות |
| (מידה) | `measure` | number | יחידת מידה לפי `unit` של הקטגוריה |
| = | (מחושב) | תצוגה | `qty × measure` |
| catalog_number | `catalog_number` | — | קיים בטיפוס, לא בשימוש ב-UI הנוכחי |

חישוב סה"כ לכל קטגוריה: `Σ(qty × measure)` ביחידת `unit`.

---

## 7. לשונית "התקדמות" (progress) — `form.progress` (`ProgressData`)

### 7.1 כרטיס "היתר משרד הסביבה" (מופיע רק אם `asbestos` בסוגי העבודה) — `asbestos_permit`
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| תאריך הגשה | `submission_date` | date | — |
| היתר התקבל | `approval_date` | date | — |
| מפקח | `supervisor` | dropdown | `PERMIT_SUPERVISORS` |
| מס׳ היתר | `permit_number` | text | — |

סטטוס אוטומטי (`PermitStatus`): התקבל / ⏳ ממתין (X ימים) / טרם הוגש.

### 7.2 כרטיס "ספקים"
| תווית | שדה בקוד | סוג | הערה |
|---|---|---|---|
| ספקים | `suppliers` | string[] | רשת 3 עמודות; עמודה 0,3,6… = `ROOFING_SUPPLIERS` (— קירוי —), שאר = `ALL_SUPPLIERS` (— ספק —). שורה חדשה נוספת בבחירת התא האחרון. okey=`prog.supplier.{i}` |
| תאריך הזמנה | `materials_order_date` | date | — |
| הגעה לאתר | `materials_arrival_date` | date | — |

### 7.3 כרטיס "תכנון ביצוע"
| תווית | שדה בקוד | סוג | אפשרויות |
|---|---|---|---|
| תאריך ביצוע | `execution_date` | date | — |
| ימים משוערים | `estimated_days` | number | נשמר כ-number ב-DB |
| ראש צוות | `team_lead` | dropdown | `TEAM_LEADS` |
| קבלן משנה | `subcontractor` | dropdown+אחר | `SUBCONTRACTORS` (— ללא —) · okey=`prog.subcontractor` |

### 7.4 כרטיס "סיכום" (מחושב, לא נשמר)
חסמים: "אין היתר" (אסבסט ללא approval_date), "אין תאריך ביצוע". דגלים: חומרים הוזמנו (יש ספק + תאריך הזמנה), צוות שובץ (יש ראש צוות), מוכן לביצוע (אין חסמים).

---

## 8. מבנה מסד הנתונים (Supabase)

### 8.1 טבלת `execution_sheets` (ה-header, 1 שורה לכל דף)
| עמודה | סוג | ברירת מחדל / הערה |
|---|---|---|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `project_name` | text | שם לקוח → כתובת → "דף ביצוע — ללא שם" |
| `sheet_date` | date | תאריך הדף |
| `created_by` | uuid → users.id | uid המשתמש |
| `filled_by` | uuid → users.id | uid המשתמש |
| `filled_by_name` | text | ברירת מחדל `''` |
| `status` | text | `field` \| `in_progress` \| `submitted` (default `field`) |
| `order_number` | text (nullable) | ⚠️ לא נכתב ע"י הטופס הנוכחי; נקרא ברשימה |
| `customer_code` | text (nullable) | ⚠️ לא נכתב ע"י הטופס הנוכחי; נקרא ברשימה |
| `recommended_team` | text (nullable) | ⚠️ לא נכתב ע"י הטופס הנוכחי; נקרא ברשימה |
| `num_buildings` | int | default 1. הטופס כותב: `max(1, מס' מבני אסבסט)` אם אסבסט פעיל, אחרת 1 |
| `general_notes` | text (nullable) | ⚠️ לא נכתב ע"י הטופס הנוכחי |
| `ai_notes` | text (nullable) | לא בשימוש בטופס |
| `progress_data` | jsonb | default `{}` — לשונית התקדמות (ראה 8.3) |
| `asbestos_buildings` | jsonb | default `[]` — **מראה** של מערך מבני האסבסט (מיגרציה 006) |
| `asbestos_total_area` | numeric | default 0 — **מראה** של שטח גגות כולל (מ"ר) |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()` (הטופס מעדכן ידנית) |

> `asbestos_buildings` / `asbestos_total_area` הן עמודות **denormalized** לדיווח/רשימה. המקור הקנוני נשאר `buildings.work_content.blocks.asbestos`.

### 8.2 טבלת `buildings` (שורה אחת, building_number=1)
| עמודה | סוג | נכתב ע"י הטופס? | הערה |
|---|---|---|---|
| `id` | uuid (PK) | — | |
| `sheet_id` | uuid → execution_sheets.id | ✓ | |
| `building_number` | int | ✓ | תמיד 1 |
| `building_name` | text | ✓ | שם לקוח או "מבנה 1" |
| `work_types` | text[] | ✓ | מערך מפתחות סוגי עבודה |
| `structure_type` | text[] | ✓ | `[construction]` אם קיים |
| `needs_crane` | bool | ✓ | crane ≠ '' ו-≠ 'לא נדרש' |
| `needs_container` | bool | ✓ | container ≠ '' ו-≠ 'לא נדרש' |
| `work_content` | jsonb | ✓ | **כל הטופס** (ראה 8.4) |
| `materials` | jsonb | ✓ | `MaterialsState` מלא |
| `roof_type`, `structure_type_old`, `height_low`, `height_high`, `obstacles`, `obstacles_notes`, `container_access`, `container_ballots`, `logistics_notes` | (שונים) | ✗ | עמודות legacy — לא בשימוש בטופס הנוכחי |
| `created_at` | timestamptz | — | |

> בשמירה: מוחקים שורות buildings עם building_number > 1 (`delete ... gt('building_number', 1)`).

### 8.3 מבנה `execution_sheets.progress_data` (jsonb)
```
{
  asbestos_permit: { submission_date, approval_date, permit_number, supervisor },
  suppliers: string[],
  materials_order_date, materials_arrival_date,
  execution_date, estimated_days (number), team_lead, subcontractor
}
```

### 8.4 מבנה `buildings.work_content` (jsonb) — כל הטופס
```
{
  details: DetailsTab,
  general: GeneralProps,
  logistics: Logistics,
  workTypes: string[],
  blocks: {
    asbestos: { buildings: AsbestosBuilding[], generalNote, sensitive, ...Open flags },
    roofReplace, aluminum, gutters, insulation, other
  },
  documentation: { photos, sketch, documents } — כל item: {path, name, note, url:'', noteOpen:false},
  notes: Record<string,string>,     // הערות כרטיסים (מפתחות: details/general/logistics)
  others: Record<string,string>     // טקסט חופשי לכל בחירת "אחר" לפי okey
}
```

### 8.5 מפתחות "אחר" (`others` map) — okeys
`gen.roofType`, `gen.construction`, `log.crane`, `rr.existingRoof`, `rr.newRoof`, `rr.construction`, `rr.color`, `rr.fillType`, `rr.tileType`, `alum.shade`, `gut.type`, `ins.type`, `ins.thickness`, `mat.<catKey>.roofingType|roofColor|tileType|fillType`, `prog.supplier.<i>`, `prog.subcontractor`.
> בלוק האסבסט **אינו** משתמש ב-`others` — שדות ה"אחר" שלו נשמרים inline באובייקט המבנה.

### 8.6 Storage
- Bucket: **`sheet-images`** (פרטי). נתיב: `{sheetId}/{photos|sketch|documents}/{timestamp}_{safeName}`.

### 8.7 טבלאות נוספות (לא בשימוש הטופס, קיימות ב-DB)
`execution_forms` + `form_images` (גרסה ישנה, 0 שורות), `sheet_images`, `building_cranes`, `product_items`, `color_options`, `work_types` (0 שורות). מערכת צ'אט: `users`, `groups`, `group_members`, `messages`, `message_reads`, `saved_messages`.

---

## 9. רשימת דפי ביצוע (`ExecutionSheetsList`)

**מסלול:** `/sheets`
**שאילתה:** `execution_sheets` — שדות: `id, project_name, sheet_date, status, order_number, customer_code, filled_by_name, recommended_team, num_buildings, created_at`, ממוין לפי `created_at` יורד.

**כל שורה (`SheetItem`):**
- כותרת: `project_name` + תג סטטוס (`STATUS_META`: בשטח/בעבודה/הוגש).
- כותרת משנה: `הזמנה {order_number} · לקוח {customer_code} · {num_buildings} מבנים` (או `filled_by_name` / "ללא פרטים").
- תאריך: `sheet_date` (או `created_at`).
- **החלקה שמאלה** → חושף "מחק" (אדום). **החלקה ימינה** → חושף "צפייה" (כחול).
- קליק על שורה → עריכה (`/sheets/{id}`).

**רכיבים נוספים:** חיפוש (שם/הזמנה/קוד לקוח/ממלא), FAB "＋" ליצירת דף חדש, מצב ריק (`EmptyState`), כפתור יציאה (רק ללא-אדמין). Realtime subscription לרענון אוטומטי. מחיקה: מוחקת קודם `buildings` ואז `execution_sheets` (בדיקת RLS ע"י ספירת שורות שנמחקו).

**`STATUS_META`:** `field`→בשטח (#CC0000) · `in_progress`→בעבודה (#B26A00) · `submitted`→הוגש (#2E7D32).

---

## 10. מסך צפייה (`ExecutionSheetView`)

**מסלול:** `/sheets/{id}/view` (read-only)
**טעינה:** `execution_sheets` (header) + `buildings` (building_number=1, work_content + materials).

**סקשנים (`Section`) — מוצגים רק אם יש נתונים, שורות ריקות מדולגות (`Row` + `has`):**
1. 👤 פרטי לקוח — שם, כתובת, הזמנה, טלפון, הכנה סולרי.
2. 🏠 מאפיינים כלליים — גובה, שטח, סוג גג, קונסטרוקציה, צ'יפים.
3. 🟠 החלפת אסבסט — כל מבנה בנפרד (מבנה N + נ.צ.) עם כל השדות; badge = `{שטח כולל} מ"ר · {N} מבנים`; הערה כללית + מבנים רגישים. תומך גם במבנה ישן (עטיפה למבנה יחיד).
4. 🏗️ החלפת גג — כל שדות roofReplace.
5. קטגוריות חומרים — לכל קטגוריה פעילה עם נתונים: כותרת קירוי (אם יש) + שורות (`type · rider · shade` = `qty × measure`) + סה"כ.
6. 🌧️ מרזבים — מבלוק העבודה.
7. 📷 תיעוד — ספירת תמונות/סקיצות/מסמכים.
8. 📝 הערה כללית — `notes.details` / `notes.general` / `blocks.other.note`.

**פוטר:** ✏️ ערוך (→`/sheets/{id}`) · שתף (Web Share API / העתקת קישור).
פונקציית `pick(value, okey)`: אם ערך="אחר" מציגה את הטקסט מ-`others[okey]`.
פונקציית `other(v, o)` (אסבסט): אם v="אחר" מציגה `o` (הטקסט inline).

---

## 11. זרימת ניווט בין מסכים

```
/login
   │  (אחרי התחברות)
   ▼
/sheets ─────────────────── רשימת דפי ביצוע (ExecutionSheetsList)
   │   │   │
   │   │   └─ החלקה שמאלה → מחיקה
   │   │
   │   ├─ FAB "＋" / כפתור מצב-ריק ──► /sheets/new  (NewExecutionSheet — דף חדש)
   │   │
   │   ├─ קליק על שורה ──────────────► /sheets/{id}       (NewExecutionSheet — עריכה)
   │   │
   │   └─ החלקה ימינה → "צפייה" ─────► /sheets/{id}/view  (ExecutionSheetView — read-only)
   │
   ▼
NewExecutionSheet
   ├─ "✕" (header) / "שמור טיוטה" ──► נשאר/חוזר; "✓ אישור ושמירה" ──► navigate('/sheets')
   │
ExecutionSheetView
   ├─ "✏️ ערוך" ──────────────────► /sheets/{id}   (עריכה)
   ├─ "←" (header) ───────────────► /sheets
   └─ "שתף" ──────────────────────► Web Share / clipboard
```

**מסלולים (routes):**
| מסלול | רכיב | תיאור |
|---|---|---|
| `/sheets` | ExecutionSheetsList | רשימה |
| `/sheets/new` | NewExecutionSheet | דף חדש (`editId`=undefined) |
| `/sheets/{id}` | NewExecutionSheet | עריכה (`editId`=id) |
| `/sheets/{id}/view` | ExecutionSheetView | צפייה read-only |

> הרשאות (מ-memory): איציק=אדמin (הכל); שאר המשתמשים=רק `/sheets`. ללא-אדמין רואה כפתור יציאה בכותרת הרשימה (אין ניווט תחתון).

---

## 12. הערות חשובות למילוי נתונים

1. **המקור הקנוני של כל שדות הטופס** הוא `buildings.work_content` (JSONB) — לא העמודות הבודדות ב-`buildings`.
2. **אסבסט רב-מבנים:** `work_content.blocks.asbestos.buildings[]`. ה-mirror ב-`execution_sheets.asbestos_buildings` נכתב במקביל בכל שמירה.
3. **שדות "אחר":** ברוב הטופס נשמרים ב-`work_content.others[okey]`; בבלוק אסבסט נשמרים inline (`structureTypeOther` וכו').
4. **התקדמות** נשמרת ב-`execution_sheets.progress_data` (לא ב-work_content).
5. עמודות `order_number`, `customer_code`, `recommended_team`, `general_notes` קיימות ב-DB ונקראות ע"י הרשימה, אך **הטופס הנוכחי אינו כותב אותן** (יישארו null בדפים חדשים).
6. `num_buildings` משקף את מספר מבני האסבסט (או 1).
7. סטטוסים חוקיים: `field`, `in_progress`, `submitted` (constraint ב-DB).
```
