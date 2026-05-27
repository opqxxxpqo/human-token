//! Gerund status words (Claude Code style) shown while user is active.
//! Each ~1.2s the widget cycles to a new word so it feels alive.

const ACTIVE: &[&str] = &[
    "Flibbertigibbeting",
    "Razzmatazzing",
    "Topsy-turvying",
    "Bamboozling",
    "Discombobulating",
    "Hullaballooing",
    "Lollygagging",
    "Skedaddling",
    "Hornswoggling",
    "Persnicketying",
    "Cattywampusing",
    "Codswalloping",
    "Bumfuzzling",
    "Gobsmacking",
    "Higgledy-piggledying",
    "Whippersnapping",
    "Kerfuffling",
    "Snickersnacking",
    "Brouhahaing",
    "Malarkeying",
];

const IDLE: &[&str] = &[
    "Ruminating",
    "Lingering",
    "Idling",
    "Resting",
    "Pondering",
];

pub fn active(idx: u64) -> &'static str {
    ACTIVE[(idx as usize) % ACTIVE.len()]
}

pub fn idle(idx: u64) -> &'static str {
    IDLE[(idx as usize) % IDLE.len()]
}
