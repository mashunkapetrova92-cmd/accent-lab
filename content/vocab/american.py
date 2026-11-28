# British-only entries in CEFR-J -> American word (dropped when the American word is already in the list)
REPL = {
 ("biscuit","noun"):"cookie", ("flat","noun"):"apartment", ("football","noun"):"soccer", ("mobile","noun"):"cell phone",
 ("mobile phone","noun"):"cell phone", ("cinema","noun"):"movie theater", ("trousers","noun"):"pants", ("mum","noun"):"mom",
 ("car park","noun"):"parking lot", ("cooker","noun"):"stove", ("motorway","noun"):"highway", ("penfriend","noun"):"pen pal",
 ("petrol","noun"):"gas", ("petrol station","noun"):"gas station", ("shop assistant","noun"):"salesclerk", ("timetable","noun"):"schedule",
 ("headteacher","noun"):"principal", ("courgette","noun"):"zucchini", ("dustbin","noun"):"trash can", ("jumper","noun"):"sweater",
 ("lorry","noun"):"truck", ("cashpoint","noun"):"ATM", ("postman","noun"):"mail carrier", ("rubbish","noun"):"trash",
 ("rubber","noun"):"eraser", ("tin","noun"):"can", ("wardrobe","noun"):"closet", ("aubergine","noun"):"eggplant",
 ("caravan","noun"):"RV", ("motorbike","noun"):"motorcycle", ("pavement","noun"):"sidewalk", ("torch","noun"):"flashlight",
 ("waistcoat","noun"):"vest", ("film","noun"):"movie", ("shop","noun"):"store", ("handbag","noun"):"purse", ("autumn","noun"):"fall",
 ("garden","noun"):"yard", ("holiday","noun"):"vacation", ("queue","noun"):"line", ("queue","verb"):"line up", ("post","verb"):"mail",
 ("revision","noun"):"review", ("revise","verb"):"review", ("hire","verb"):"rent", ("chemist","noun"):"pharmacist",
 ("fortnight","noun"):None, ("washing-up","noun"):"dishes", ("tick","verb"):"check", ("tick","noun"):"check mark",
 ("overtake","verb"):"pass", ("nought","noun"):"zero", ("lecturer","noun"):"professor", ("pub","noun"):"bar", ("bin","noun"):"trash can",
 ("pence","noun"):"cent",
}
# keep these as they are, with the American sense: holiday stays as a word too (public holiday) via REPL->vacation only if missing
FIX_POS = {("batter", ""): "noun", ("remonstrate", "vern"): "verb"}
