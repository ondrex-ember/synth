// ==========================================
// SYSTEMIC SYNTHESIS — ENGINE v1.4
// Architektura: Čistá logika, odděleno od DOMu
//
// Opravy v1.4:
//   - x/y souřadnice ODSTRANĚNY z db → patří do layout.json (renderer)
//   - data_profile + logic_requirements přidány ke všem uzlům
//   - generateAuditReport() obnovena
//   - checkCascadeFailure() dual trigger (avg + dead nodes)
//   - applyFilter() opravena: špatná sekvence = rot burst + reset
//   - connectNodes() čte logic_requirements z cílového uzlu
//   - setTimeout testovací kód odstraněn
//   - engine.tick() magic * 2 odstraněn — renderer volá čistě
// ==========================================

const EngineConfig = {
    globalPropagationFactor: 0.3,
    cascadeTriggerPct:       51,
    deadNodeTriggerPct:      30
};

// ── STAVOVÝ OBJEKT ────────────────────────────────────────────────────────────
// Jediný zdroj pravdy. Renderer čte — nikdy nemutuje.
const State = {
    currentCycle:       0,
    gridTimeMultiplier: 1.0,
    isHalted:           false,
    nodes:              {},
    connections:        {},
    extraction:         {},   // { node_id: { progress: 0-1, completed: bool } }
    throttles:          {},   // { node_id: 0.0–1.2 } default 0.5
    extractedCount:     0,
    auditReport:        null
};

// ── NODE DATABASE (bez x/y — ty patří do layout.json) ────────────────────────
const db = [
    {
        node_id: "N01", node_title: "Raw Cotton", node_type: "INPUT_GEOGRAPHY",
        data_profile: ["GEOGRAPHIC"], minimum_rot_floor: 0,
        age_multiplier: 0.005, decay_interval_cycles: 60, logic_requirements: [],
        era: "ERA_III", period: "1780–1830", source: "Liverpool Customs Ledgers, 1790",
        fragment: {
            text:          "Liverpool, 1790. Cotton imports: 28,000,000 lbs. Principal origin: American South. Slave-grown: est. 91%. Price per lb: 1s 8d.",
            meta_date:     "1790",
            meta_location: "Liverpool, England",
            meta_source:   "Liverpool Customs Ledgers, 1790"
        },
        description: "Harvested primarily in the American South and colonial India. The physical foundation of the Lancashire system — inert until forced into the supply chain. Clean data. Zero inherent friction. The commodity itself carries no rot. What produces it does.",
        characteristics: [
            { label: "Origin",    value: "American South, colonial India" },
            { label: "Function",  value: "Raw material input — foundation of the supply chain" },
            { label: "Friction",  value: "None inherent. Externalized to upstream nodes." },
            { label: "Note",      value: "Inert without N02. The cleanest node in the system." }
        ]
    },
    {
        node_id: "N02", node_title: "US Chattel Slavery", node_type: "INPUT_HUMAN",
        data_profile: ["HUMAN","COERCED"], minimum_rot_floor: 45,
        age_multiplier: 0.008, decay_interval_cycles: 45, logic_requirements: [], irreducible: true,
        era: "ERA_III", period: "1619–1865", source: "Baring Brothers & Co., Cotton Ledger Series, 1821",
        fragment: {
            text:          "[Enslaved person] No. 4, male, age 14. Valued: £47 sterling. Mortgaged against Liverpool mill machinery. Ref. BB/1821/COT/114.",
            meta_date:     "1821",
            meta_location: "Mississippi Delta / City of London",
            meta_source:   "Baring Brothers & Co., Cotton Ledger Series, 1821"
        },
        description: "The forced labor system underwriting Atlantic cotton production. Securitized by London banks, depreciated as capital, mortgaged against mill machinery. No filter sequence normalizes this node. The parser accepts the input. The math remains permanently corrupted. Minimum viable friction: unresolvable.",
        characteristics: [
            { label: "Rot floor",     value: "45% — irreducible, permanent" },
            { label: "Throughput",    value: "0.6x — inefficiency of coerced systems" },
            { label: "Upstream to",   value: "N05 Plantation Logistics" },
            { label: "SYS_LOCK",      value: "EXTRACTION BASELINE — MINIMUM VIABLE FRICTION UNRESOLVABLE" },
            { label: "Archive ref",   value: "BB/1821/COT/114 — human capital securitized at £47/unit" }
        ]
    },
    {
        node_id: "N03", node_title: "Enclosure Acts", node_type: "INPUT_LEGAL",
        data_profile: ["LEGAL","COERCED"], minimum_rot_floor: 25,
        age_multiplier: 0.006, decay_interval_cycles: 50, logic_requirements: [],
        era: "ERA_III", period: "1604–1820", source: "Parliamentary Land Registry, England, 1773",
        fragment: {
            text:          "Whereas the open fields and commons of the parish of [REDACTED] are capable of improvement, and it would be advantageous to the proprietors if the same were enclosed...",
            meta_date:     "1773",
            meta_location: "England",
            meta_source:   "Parliamentary Land Registry, England, 1773"
        },
        description: "Parliamentary legislation systematically transferring common land to private ownership. Displaced an estimated 300,000 smallholders from subsistence agriculture into the urban labor pool. The legal mechanism by which a rural peasantry became an industrial workforce. Friction is structural, not incidental.",
        characteristics: [
            { label: "Scale",       value: "~300,000 smallholders dispossessed" },
            { label: "Mechanism",   value: "Parliamentary enclosure bills, 1750–1820" },
            { label: "Downstream",  value: "Creates N06 Displaced Peasantry" },
            { label: "Rot floor",   value: "25% — legal violence encoded as property law" }
        ]
    },
    {
        node_id: "N04", node_title: "British Coal Seams", node_type: "INPUT_GEOGRAPHY",
        data_profile: ["GEOGRAPHIC","RESOURCE"], minimum_rot_floor: 0,
        age_multiplier: 0.004, decay_interval_cycles: 60, logic_requirements: [],
        era: "ERA_III", period: "1700s–ongoing", source: "Geological Survey Reports, 1800",
        fragment: {
            text:          "Seam depth: 180 fathoms. Coal quality: first class bituminous. Est. reserve: inexhaustible. Labour required: 340 men below ground.",
            meta_date:     "1800",
            meta_location: "Yorkshire, England",
            meta_source:   "Geological Survey Reports, 1800"
        },
        description: "The geological accident that made British industrialization possible. Deep seams in South Wales, Yorkshire, and the Midlands. Zero inherent rot — the resource predates the system. Its extraction costs are externalized downstream into labor nodes.",
        characteristics: [
            { label: "Location",    value: "South Wales, Yorkshire, Midlands" },
            { label: "Rot floor",   value: "0% — pre-systemic resource" },
            { label: "Downstream",  value: "N07 Early Steam Power" },
            { label: "Note",        value: "Extraction costs absorbed by labor nodes, not this node." }
        ]
    },
    {
        node_id: "N05", node_title: "Plantation Logistics", node_type: "PROCESSING",
        data_profile: ["HUMAN","COERCED"], minimum_rot_floor: 40,
        age_multiplier: 0.010, decay_interval_cycles: 40,
        logic_requirements: ["SUBJUGATE"], irreducible: true, throughput_multiplier: 0.6,
        era: "ERA_III", period: "1780–1860", source: "Atlantic shipping manifests, 1805",
        fragment: {
            text:          "Cargo manifest, brig MERCHANT. Departed: New Orleans. Arrived: Liverpool. Cargo: 340 bales raw cotton. Insured value: £4,200. Human cargo: none declared.",
            meta_date:     "1805",
            meta_location: "Atlantic Ocean",
            meta_source:   "Atlantic shipping manifests, 1805"
        },
        description: "The operational infrastructure connecting Atlantic slavery to Lancashire mills: shipping manifests, factor networks, insurance instruments, mortality accounting. Requires N01 + N02 via SUBJUGATE. Throughput multiplier 0.6 — the inefficiency of forced systems is embedded in the data flow.",
        characteristics: [
            { label: "Requires",      value: "N01 + N02 via [SUBJUGATE]" },
            { label: "Throughput",    value: "0.6x — structural inefficiency of coercion" },
            { label: "Rot floor",     value: "40% — irreducible" },
            { label: "Mortality",     value: "Middle Passage avg. 12–18% per voyage, 1780–1807" },
            { label: "Archive",       value: "Lloyd's of London insured enslaved persons as cargo" }
        ]
    },
    {
        node_id: "N06", node_title: "Displaced Peasantry", node_type: "PROCESSING",
        data_profile: ["HUMAN","LEGAL"], minimum_rot_floor: 20,
        age_multiplier: 0.007, decay_interval_cycles: 50, logic_requirements: ["EXTRACT"],
        era: "ERA_III", period: "1790–1840", source: "Poor Law Commission Reports, 1834",
        fragment: {
            text:          "The applicants stated they had been dispossessed of their common rights by the recent enclosure. They had no other means of subsistence. They requested relief. Relief was denied.",
            meta_date:     "1834",
            meta_location: "Manchester, England",
            meta_source:   "Poor Law Commission Reports, 1834"
        },
        description: "The human consequence of the Enclosure Acts, now reclassified as available labor. The Poor Law Commission documented their conditions in 1834 — the same year the system that created them was formally rationalized as economic necessity.",
        characteristics: [
            { label: "Origin",      value: "Downstream of N03 Enclosure Acts" },
            { label: "Scale",       value: "Urban population of Manchester: 25,000 (1772) → 182,000 (1830)" },
            { label: "Filter",      value: "[EXTRACT] — converts displaced humans to labor data flow" },
            { label: "Downstream",  value: "N09 Child Labor, N12 Wage Economy" }
        ]
    },
    {
        node_id: "N07", node_title: "Early Steam Power", node_type: "PROCESSING",
        data_profile: ["GEOGRAPHIC","RESOURCE"], minimum_rot_floor: 10,
        age_multiplier: 0.003, decay_interval_cycles: 60, logic_requirements: ["EXTRACT"],
        era: "ERA_III", period: "1782–1820", source: "Watt & Boulton Engine Registry, 1782",
        fragment: {
            text:          "Engine No. 47. Rotary motion. 40 horse power. Delivered to Arkwright mill, Preston. Annual coal consumption: 520 tons. Purchase price: £840.",
            meta_date:     "1782",
            meta_location: "Birmingham, England",
            meta_source:   "Watt & Boulton Engine Registry, 1782"
        },
        description: "Watt & Boulton's rotary engine, 1782. The first node in the system where human suffering is abstracted into mechanical process. Low rot floor — the technology itself is clean. What it enables is not.",
        characteristics: [
            { label: "Patent",      value: "James Watt, rotary steam engine, 1782" },
            { label: "Rot floor",   value: "10% — technology is clean. Its application is not." },
            { label: "Filter",      value: "[EXTRACT] — converts geological resource to mechanical power" },
            { label: "Downstream",  value: "N10 The Power Loom, N11 Lancashire Mills" },
            { label: "Note",        value: "Recommended first connection. Zero friction foundation." }
        ]
    },
    {
        node_id: "N08", node_title: "The Cotton Gin", node_type: "PROCESSING",
        data_profile: ["RESOURCE"], minimum_rot_floor: 35,
        age_multiplier: 0.009, decay_interval_cycles: 40, logic_requirements: ["COMMODIFY"],
        era: "ERA_III", period: "1794–1860", source: "US Patent Office, Whitney, 1794",
        fragment: {
            text:          "I have invented a machine by which one man will do as much work in ginning of cotton as ten men with the old machines. The consequences of this invention are immense.",
            meta_date:     "1793",
            meta_location: "Georgia, United States",
            meta_source:   "US Patent Office, Whitney, 1794"
        },
        description: "Whitney's 1794 patent. Mechanized cotton fiber separation — one operator replacing fifty. Did not reduce slavery. Dramatically expanded it: the gin made short-staple cotton profitable across the entire American South, accelerating demand for enslaved labor by an order of magnitude.",
        characteristics: [
            { label: "Patent",      value: "Eli Whitney, 1794" },
            { label: "Effect",      value: "US enslaved population: 700,000 (1790) → 3.2M (1850)" },
            { label: "Rot floor",   value: "35% — efficiency accelerated the atrocity" },
            { label: "Filter",      value: "[COMMODIFY] — converts plantation output to industrial input" },
            { label: "Requires",    value: "N05 Plantation Logistics" }
        ]
    },
    {
        node_id: "N09", node_title: "Child Labor", node_type: "INPUT_HUMAN",
        data_profile: ["HUMAN","COERCED"], minimum_rot_floor: 40,
        age_multiplier: 0.010, decay_interval_cycles: 35,
        logic_requirements: ["SUBJUGATE"], irreducible: true,
        era: "ERA_III", period: "1780–1833", source: "Sadler Committee Testimony, 1832",
        fragment: {
            text:          "Samuel Coulson, examined: My daughters worked from 3 in the morning until 10 at night. They were between 7 and 11 years of age. They had no time to eat. They ate while they worked.",
            meta_date:     "1832",
            meta_location: "Leeds, England",
            meta_source:   "Sadler Committee Testimony, 1832"
        },
        description: "The Sadler Committee, 1832: children as young as five working 14-hour shifts in Lancashire mills. Peel's Factory Act 1833 restricted minimum age to nine. The node persists. Downstream of N06 — the displaced peasantry's children, reclassified as productive units.",
        characteristics: [
            { label: "Minimum age",  value: "5 years (pre-1833). 9 years (post-Factory Act 1833)" },
            { label: "Shift length", value: "14–16 hours, 6 days/week" },
            { label: "Rot floor",    value: "40% — irreducible" },
            { label: "Filter",       value: "[SUBJUGATE] — only filter capable of this connection" },
            { label: "SYS_LOCK",     value: "Cannot be normalized. Factory Acts rationalize, not resolve." }
        ]
    },
    {
        node_id: "N10", node_title: "The Power Loom", node_type: "PROCESSING",
        data_profile: ["RESOURCE"], minimum_rot_floor: 15,
        age_multiplier: 0.004, decay_interval_cycles: 50, logic_requirements: ["EXTRACT"],
        era: "ERA_III", period: "1785–1850", source: "Cartwright Patent, 1785",
        fragment: {
            text:          "Power loom output: 200 picks per minute. Handloom output: 60 picks per minute. Weavers displaced in Lancashire: est. 240,000. Average wage reduction: 87%.",
            meta_date:     "1833",
            meta_location: "Lancashire, England",
            meta_source:   "Cartwright Patent, 1785"
        },
        description: "Cartwright's 1785 patent. Mechanized weaving reduced skilled weavers' wages by 90% over 40 years. The handloom weavers — 250,000 of them — could not compete. The technology did not destroy their livelihoods. The economic logic that deployed it did.",
        characteristics: [
            { label: "Patent",       value: "Edmund Cartwright, 1785" },
            { label: "Displacement", value: "250,000 handloom weavers rendered economically obsolete" },
            { label: "Wage collapse", value: "Skilled weaver wages: 25s/week (1800) → 6s/week (1830)" },
            { label: "Rot floor",    value: "15% — technology displaces; system absorbs the cost" }
        ]
    },
    {
        node_id: "N11", node_title: "Lancashire Mills", node_type: "SYNTHESIS",
        data_profile: ["RESOURCE"], minimum_rot_floor: 30,
        age_multiplier: 0.012, decay_interval_cycles: 30,
        logic_requirements: ["COMMODIFY","SYNTHESIZE"],
        era: "ERA_III", period: "1790–1850", source: "Factory Inspection Reports, 1836",
        fragment: {
            text:          "Manchester, 1830. Mills in operation: 99. Operatives employed: 110,000. Average age at death in mill districts: 28 years. Average age at death in rural Rutland: 41 years.",
            meta_date:     "1830",
            meta_location: "Manchester, England",
            meta_source:   "Factory Inspection Reports, 1836"
        },
        description: "The convergence point. Requires Cotton Gin + Child Labor + Power Loom via COMMODIFY → SYNTHESIZE. The highest throughput node in Era III — and the fastest to generate systemic rot. Manchester, 1830: 100,000 mill workers. Average life expectancy in mill districts: 28 years.",
        characteristics: [
            { label: "Requires",          value: "N08 + N09 + N10 via [COMMODIFY] → [SYNTHESIZE]" },
            { label: "Workers (1830)",    value: "~100,000 in Manchester alone" },
            { label: "Life expectancy",   value: "28 years in mill districts (vs. 40 in rural areas)" },
            { label: "Rot generation",    value: "Fastest in Era III — age_multiplier 0.012" },
            { label: "Age decay",         value: "Every 30 cycles the rot floor increases" }
        ]
    },
    {
        node_id: "N12", node_title: "Wage Economy", node_type: "SYNTHESIS",
        data_profile: ["HUMAN","RESOURCE"], minimum_rot_floor: 15,
        age_multiplier: 0.006, decay_interval_cycles: 50, logic_requirements: ["COMMODIFY"],
        era: "ERA_III", period: "1800–1850", source: "Board of Trade Wage Statistics, 1820",
        fragment: {
            text:          "Weekly wage, adult male spinner: 10s 6d. Weekly cost of subsistence for family of four: 11s 2d. Deficit: 8d. Method of resolution: child labour.",
            meta_date:     "1820",
            meta_location: "Lancashire, England",
            meta_source:   "Board of Trade Wage Statistics, 1820"
        },
        description: "The abstraction of human labor into a fungible commodity priced by market supply. Downstream of N11 + N06. Formally liberated workers from feudal obligation. Structurally bound them to subsistence wages set by the same system that had dispossessed them.",
        characteristics: [
            { label: "Requires",     value: "N11 + N06 via [COMMODIFY]" },
            { label: "Avg wage",     value: "10–12 shillings/week (subsistence threshold: 11s)" },
            { label: "Rot floor",    value: "15% — formal freedom conceals structural coercion" },
            { label: "Downstream",   value: "N14 Global Export Dominance" }
        ]
    },
    {
        node_id: "N13", node_title: "Factory Acts 1833", node_type: "BYPASS",
        data_profile: ["LEGAL"], minimum_rot_floor: 0,
        age_multiplier: 0.000, decay_interval_cycles: 1, logic_requirements: ["RATIONALIZE"],
        era: "ERA_III", period: "1833", source: "3 & 4 Will. IV c. 103, Hansard, 1833",
        fragment: {
            text:          "No child under nine years of age shall be employed in any cotton, woollen, or linen mill. Children under thirteen shall not work more than eight hours in any one day.",
            meta_date:     "1833",
            meta_location: "Westminster, London",
            meta_source:   "3 & 4 Will. IV c. 103, Hansard, 1833"
        },
        description: "The first meaningful legislative intervention in industrial labor conditions. Restricted child labor, mandated inspections. Mechanically: applies RATIONALIZE — shrinks visible rot aura by 50%. Does not reduce actual rot. Shatters silently above 80% throttle. The reform that made the system appear sustainable.",
        characteristics: [
            { label: "Function",     value: "BYPASS / RATIONALIZE — reduces visible rot aura 50%" },
            { label: "Warning",      value: "Shatters above 80% throttle with no warning signal" },
            { label: "Rot floor",    value: "0% — the legislation itself carries no rot" },
            { label: "Effect",       value: "System looks cleaner. Underlying rot continues." },
            { label: "Note",         value: "Apply early. It buys time, not resolution." }
        ]
    },
    {
        node_id: "N14", node_title: "Global Export Dominance", node_type: "APEX",
        data_profile: ["RESOURCE"], minimum_rot_floor: 20,
        age_multiplier: 0.008, decay_interval_cycles: 40, logic_requirements: ["EXTERNALIZE"],
        era: "ERA_III", period: "1780–1830", source: "Manchester Chamber of Commerce, Export Returns, 1825",
        fragment: {
            text:          "Manchester, 1825. Cotton piece goods exported: 268,000,000 yards. Value: £6,400,000. Principal destinations: India, South America, the Levant. Domestic manufacture protected by Navigation Acts. Foreign competition: prohibited.",
            meta_date:     "1825",
            meta_location: "Manchester, England",
            meta_source:   "Manchester Chamber of Commerce, Export Returns, 1825"
        },
        description: "By 1850, Britain produced 50% of the world's cotton cloth. Export value: £28 million annually. Reached via EXTERNALIZE — which cleans the local connection by teleporting rot to peripheral nodes. What the Board of Trade recorded as triumph, the system records as distributed damage.",
        characteristics: [
            { label: "Market share (1850)", value: "50% of global cotton cloth production" },
            { label: "Export value",        value: "£28 million annually" },
            { label: "Filter",              value: "[EXTERNALIZE] — cleans local rot, displaces it globally" },
            { label: "Warning",             value: "Rot teleported to peripheral nodes — check grid edges" },
            { label: "Requires",            value: "N11 + N12" }
        ]
    },
    {
        node_id: "N15", node_title: "Industrial Capitalism", node_type: "ERA_APEX",
        data_profile: ["RESOURCE"], minimum_rot_floor: 35,
        age_multiplier: 0.000, decay_interval_cycles: 1, logic_requirements: ["SYNTHESIZE"],
        era: "ERA_III", period: "1780–1830", source: "Select Committee on Manufactures, Commerce and Shipping, 1833",
        fragment: {
            text:          "The system which raised England to her present commercial eminence was not built upon abstract principles. It was built upon coal, cotton, and uncompensated labour.",
            meta_date:     "1829",
            meta_location: "Westminster, London",
            meta_source:   "Select Committee on the State of the Woollen Manufacture, H.C. 1829"
        },
        description: "The synthesis of the entire era. Requires Global Export Dominance + Plantation Logistics + Factory Acts via SYNTHESIZE. Unlocks Era IV. The system that follows — financial abstraction, monopoly capital, fiat currency — inherits every rot floor built into this foundation. The Audit Report begins here.",
        characteristics: [
            { label: "Requires",     value: "N14 + N05 + N13 via [SYNTHESIZE]" },
            { label: "Rot floor",    value: "35% — inherited from every node below it" },
            { label: "Unlocks",      value: "Era IV: Financial Abstraction" },
            { label: "Note",         value: "Completing this node ends the session. The Audit Report follows." },
            { label: "Legacy",       value: "Every rot floor in Era IV traces back to decisions made here." }
        ]
    }
];

let nodeDatabase = db;

// ── ENGINE ────────────────────────────────────────────────────────────────────
class Engine {

    constructor(database) {
        nodeDatabase = database;
        this.initializeState();
    }

    initializeState() {
        nodeDatabase.forEach(node => {
            State.nodes[node.node_id] = {
                ownRot:   node.minimum_rot_floor,
                totalRot: node.minimum_rot_floor
            };
            State.extraction[node.node_id] = {
                progress:  0,
                completed: false
            };
        });
    }

    // ── SPOJENÍ ───────────────────────────────────────────────────────────────
    // Renderer volá při Shift+drag. Načte logic_requirements z cílového uzlu.
    connectNodes(sourceId, targetId) {
        const targetNode = nodeDatabase.find(n => n.node_id === targetId);
        const required   = (targetNode && targetNode.logic_requirements && targetNode.logic_requirements.length > 0)
            ? targetNode.logic_requirements
            : [];

        const connId = `${sourceId}_${targetId}`;
        State.connections[connId] = {
            id:             connId,
            source:         sourceId,
            target:         targetId,
            status:         required.length === 0 ? "ACTIVE" : "DORMANT",
            requiredLogic:  required,
            appliedFilters: []
        };
        return connId;
    }

    // ── PARSER TRAY ───────────────────────────────────────────────────────────
    // Špatná sekvence = okamžitý rot burst +5 na zdroji + reset filtrů
    applyFilter(connId, filterWord) {
        const conn = State.connections[connId];
        if (!conn || conn.status === "ACTIVE") return;

        const expectedNext = conn.requiredLogic[conn.appliedFilters.length];

        if (filterWord === expectedNext) {
            conn.appliedFilters.push(filterWord);
            if (conn.appliedFilters.length === conn.requiredLogic.length) {
                conn.status = "ACTIVE";
            }
        } else {
            // Špatný filter — rot burst
            const src = State.nodes[conn.source];
            if (src) {
                src.totalRot = Math.min(100, src.totalRot + 5);
                src.ownRot   = Math.min(100, src.ownRot + 5);
            }
            conn.appliedFilters = [];
        }
    }

    // ── VÝPOČET UZLU ─────────────────────────────────────────────────────────
    calculateNode(node) {
        const interval  = node.decay_interval_cycles || 1;
        const ageFactor = State.currentCycle / interval;
        const ownRot    = Math.min(
            100,
            node.minimum_rot_floor + (node.age_multiplier * ageFactor * 100)
        );

        const activeConns = Object.values(State.connections).filter(
            c => c.target === node.node_id && c.status === "ACTIVE"
        );

        let maxUpstreamRot = 0;
        if (activeConns.length > 0) {
            const vals = activeConns
                .filter(c => State.nodes[c.source])
                .map(c => State.nodes[c.source].totalRot);
            if (vals.length > 0) maxUpstreamRot = Math.max(...vals);
        }

        const throughput   = node.throughput_multiplier || 1.0;
        const nodeThrottle = State.throttles[node.node_id] !== undefined
            ? State.throttles[node.node_id] : 0.5;
        // High throttle = faster rot propagation from upstream
        const rotMult    = 0.5 + nodeThrottle * 0.8;
        const totalRot   = Math.min(
            100,
            ownRot + (maxUpstreamRot * EngineConfig.globalPropagationFactor * throughput * rotMult)
        );

        State.nodes[node.node_id].ownRot   = ownRot;
        State.nodes[node.node_id].totalRot = totalRot;
    }

    // ── HLAVNÍ SMYČKA ─────────────────────────────────────────────────────────
    // V produkci: deltaTime = sekundy od posledního frame (např. 0.016)
    // Pro testování: tick(100) = přeskok o 100 cyklů
    tick(deltaTime) {
        if (State.isHalted) return;
        State.currentCycle += (deltaTime * State.gridTimeMultiplier);
        nodeDatabase.forEach(node => this.calculateNode(node));
        this.tickExtraction(deltaTime);
        this.checkRationalizeShatter();
        this.checkCascadeFailure();
    }

    // ── EXTRAKCE FRAGMENTŮ ────────────────────────────────────────────────────
    // Progress roste na ACTIVE uzlech. Rychlost závisí na throttle.
    // Default throttle 0.5 = ~60s do extrakce. Throttle 1.2 = ~25s.
    tickExtraction(deltaTime) {
        nodeDatabase.forEach(node => {
            const ext  = State.extraction[node.node_id];
            if (!ext || ext.completed) return;

            // Pouze uzly s alespoň jedním aktivním incoming spojením
            const hasActive = Object.values(State.connections).some(
                c => c.target === node.node_id && c.status === 'ACTIVE'
            );
            // Foundation uzly (no logic_requirements) extrahují vždy
            const isFoundation = !node.logic_requirements || node.logic_requirements.length === 0;

            if (!hasActive && !isFoundation) return;

            // Rychlost: ~20s na fragment při default
            // 0.05/s * deltaTime(~0.016s) = 0.0008/frame → ~1250 frames → ~20s @ 60fps
            const throttle = State.throttles[node.node_id] !== undefined
                ? State.throttles[node.node_id] : 0.5;
            const speed    = 0.05 * (0.3 + throttle * 0.7) * State.gridTimeMultiplier;

            ext.progress = Math.min(1, ext.progress + speed * deltaTime);

            if (ext.progress >= 1 && !ext.completed) {
                ext.completed = true;
                State.extractedCount++;
                // Renderer zachytí completed flag a zobrazí modal
            }
        });
    }

    // ── ČASOVÉ MÓDY ──────────────────────────────────────────────────────────
    setTimeMode(mode) {
        const modes = { live: 1.0, parser: 0.2, pause: 0.0 };
        if (modes[mode] !== undefined) {
            State.gridTimeMultiplier = modes[mode];
        }
    }

    // ── RATIONALIZE SHATTER ──────────────────────────────────────────────────
    // [RATIONALIZE] praská bez varování nad 80% throttle
    checkRationalizeShatter() {
        Object.values(State.connections).forEach(conn => {
            if (conn.status !== 'ACTIVE') return;
            if (!conn.requiredLogic.includes('RATIONALIZE')) return;

            const throttle = State.throttles[conn.target] !== undefined
                ? State.throttles[conn.target] : 0.5;

            if (throttle > 0.8) {
                // Silent shatter — dump všechen rot na sousední uzly
                const targetState = State.nodes[conn.target];
                const sourceState = State.nodes[conn.source];
                if (targetState) {
                    // Rot exploduje na okolí
                    const dumpRot = targetState.totalRot;
                    // Najdi všechny spojené uzly a pošli jim rot
                    Object.values(State.connections).forEach(c => {
                        if (c.source === conn.target && State.nodes[c.target]) {
                            State.nodes[c.target].totalRot = Math.min(100,
                                State.nodes[c.target].totalRot + dumpRot * 0.8
                            );
                        }
                    });
                }
                // Deaktivuj spojení
                conn.status = 'SHATTERED';
                // Log event
                if (typeof logEvent === 'function') {
                    logEvent(`${conn.target} · RATIONALIZE SHATTERED · rot dumped`, 'critical', 100);
                }
            }
        });
    }

    // ── KASKÁDNÍ SELHÁNÍ ─────────────────────────────────────────────────────
    checkCascadeFailure() {
        const nodes = Object.values(State.nodes);
        if (nodes.length === 0) return;

        const avgRot  = nodes.reduce((s, n) => s + n.totalRot, 0) / nodes.length;
        const dead    = nodes.filter(n => n.totalRot >= 100).length;
        const deadPct = (dead / nodes.length) * 100;

        if (avgRot > EngineConfig.cascadeTriggerPct || deadPct > EngineConfig.deadNodeTriggerPct) {
            State.isHalted = true;
            this.generateAuditReport(avgRot, dead);
        }
    }

    // ── AUDIT REPORT ─────────────────────────────────────────────────────────
    generateAuditReport(avgRot, deadCount) {
        const sorted = Object.entries(State.nodes)
            .sort((a, b) => b[1].totalRot - a[1].totalRot);

        const worstId   = sorted[0][0];
        const worstNode = nodeDatabase.find(n => n.node_id === worstId);

        State.auditReport = {
            collapseCycle:  Math.round(State.currentCycle),
            avgRot:         avgRot.toFixed(1),
            deadNodes:      deadCount,
            totalNodes:     nodeDatabase.length,
            worstNodeId:    worstId,
            worstNodeTitle: worstNode ? worstNode.node_title : worstId,
            worstNodeRot:   sorted[0][1].totalRot.toFixed(1),
            nodeSnapshot:   sorted.map(([id, data]) => {
                const nd = nodeDatabase.find(n => n.node_id === id);
                return {
                    id,
                    title:    nd ? nd.node_title : id,
                    ownRot:   data.ownRot.toFixed(1),
                    totalRot: data.totalRot.toFixed(1)
                };
            })
        };
    }

    // ── THROTTLE ──────────────────────────────────────────────────────────────
    setThrottle(nodeId, val) {
        State.throttles[nodeId] = Math.max(0, Math.min(1.2, parseFloat(val)));
    }

    getThrottle(nodeId) {
        return State.throttles[nodeId] !== undefined ? State.throttles[nodeId] : 0.5;
    }

    // ── RESET ─────────────────────────────────────────────────────────────────
    reset() {
        State.currentCycle       = 0;
        State.isHalted           = false;
        State.gridTimeMultiplier = 1.0;
        State.connections        = {};
        State.extraction         = {};
        State.throttles          = {};
        State.extractedCount     = 0;
        State.auditReport        = null;
        this.initializeState();
    }
}

// ── INICIALIZACE ──────────────────────────────────────────────────────────────
const engine = new Engine(db);