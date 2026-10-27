# Shared ids

The node files are written in parts. Use these ids when one part needs to
point at a node another part owns, so links resolve. Each part may add any
other ids it needs (kebab-case, descriptive), and should prefix nothing.
If you need a prerequisite that belongs to another part and isn't listed,
reference the id you'd expect and list it in your report; the merge step
will reconcile.

## Part A: roots, resources, prehistory to 1450 (`nodes/a-ancient.yaml`)
Preconditions: `precision-grip`, `large-brain`, `vision`, `hearing`,
`touch`, `vocal-tract`, `language-capacity`, `bipedalism`, `cooperation`.
Resources: `res-flint`, `res-wood`, `res-clay`, `res-fertile-soil`,
`res-fresh-water`, `res-copper`, `res-tin`, `res-iron-ore`, `res-gold`,
`res-silver`, `res-salt`, `res-coal`, `res-oil`, `res-natural-gas`,
`res-uranium`, `res-lithium`, `res-rare-earths`, `res-helium`,
`res-silicon`, `res-phosphate`, `res-potash`, `res-germanium`,
`res-cobalt`, `res-nickel`, `res-platinum-group`, `res-sulfur`.
Techs: `stone-tools`, `control-of-fire`, `spoken-language`, `clothing`,
`art-symbolic`, `bow-and-arrow`, `domestication-dogs`, `agriculture`,
`animal-domestication`, `pottery`, `irrigation`, `cities`, `copper-smelting`,
`bronze`, `wheel`, `writing`, `numerals`, `calendar`, `law-codes`,
`iron-smelting`, `coinage`, `alphabet`, `geometry`, `astronomy-ancient`,
`concrete-roman`, `paper`, `gunpowder`, `compass`, `place-value-zero`,
`algebra`, `double-entry-bookkeeping`, `universities`, `mechanical-clock`,
`windmill`, `watermill`, `glassmaking`, `lenses`.

## Part B: 1450 to 1945, physical sciences, industry, institutions (`nodes/b-modern.yaml`)
`printing-press`, `scientific-method`, `telescope`, `heliocentrism`,
`newtonian-mechanics`, `calculus`, `probability-theory`, `joint-stock-company`,
`patents`, `stock-exchange`, `central-banking`, `insurance-modern`,
`statistics`, `steam-engine`, `coke-iron-smelting`, `factory-system`,
`railway`, `steel-bessemer`, `electric-battery`, `electromagnetism`,
`electromagnetic-induction`, `maxwell-equations`, `telegraph`, `telephone`,
`thermodynamics`, `periodic-table`, `atomic-theory`, `electric-generator`,
`electric-light`, `power-grid`, `internal-combustion-engine`, `automobile`,
`airplane`, `radio`, `vacuum-tube`, `haber-bosch`, `oil-refining`,
`plastics`, `x-rays`, `quantum-mechanics`, `relativity`, `nuclear-fission`,
`nuclear-weapon`, `rocketry`, `radar`, `peer-review`, `boolean-logic`,
`computability-theory`, `information-theory`.

## Part C: biology and medicine, all eras, and the DNA sequencing deep dive (`nodes/c-bio.yaml`)
`microscope`, `cell-theory`, `vaccination`, `germ-theory`, `anesthesia`,
`antiseptic-surgery`, `evolution-natural-selection`, `mendelian-genetics`,
`chromosome-theory`, `antibiotics-penicillin`, `randomized-controlled-trial`,
`dna-genetic-material`, `dna-double-helix`, `genetic-code`,
`recombinant-dna`, `sanger-sequencing`, `pcr`, `automated-sequencing`,
`human-genome-project`, `next-generation-sequencing`, `nanopore-sequencing`,
`long-read-sequencing`, `crispr-cas9`, `mrna-vaccines`, `protein-structure-prediction`,
`gene-therapy`, `green-revolution`, `ivf`, plus future: `aging-reversal`,
`whole-brain-emulation`.

## Part D: electronics, computing and AI from 1945, and the AI deep dive (`nodes/d-computing.yaml`)
`transistor`, `integrated-circuit`, `microprocessor`, `stored-program-computer`,
`programming-languages`, `packet-switching`, `internet`, `world-wide-web`,
`personal-computer`, `smartphone`, `gpu`, `perceptron`, `backpropagation`,
`deep-learning`, `convolutional-networks`, `transformer`, `large-language-models`,
`scaling-laws`, `reinforcement-learning`, `quantum-computing`, plus future:
`agi`, `fault-tolerant-quantum-computer`.

## Part E: other fields since 1945, and the future frontier (`nodes/e-frontier.yaml`)
`nuclear-power`, `solar-photovoltaic`, `lithium-ion-battery`, `fusion-power`,
`satellites`, `human-spaceflight`, `moon-landing`, `reusable-rockets`,
`gps`, `container-shipping`, `nitrogen-fertilizer-scale` (if distinct from
`haber-bosch`), `desalination`, `carbon-capture`, `superconductors-high-temp`,
`graphene`, `3d-printing`, `mars-settlement`, `space-based-solar`,
`molecular-nanotechnology`.
