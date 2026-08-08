(() => {
  'use strict';

  const TARGET = 100000000;  // OVR ustawiane od razu po wklejeniu
  const CAP = 100000000;     // sufit OVR (grajewskiOverallCap)
  const SLOT_PREFIX = 'pps-career-save-v1-slot-';
  const SLOT_INDEX_KEY = 'pps-career-save-v1-slot-index';
  const q = sel => document.querySelector(sel);

  // Każda wartość poniżej jest wyprowadzona z konkretnego wzoru w silniku
  // (10-polska-kariera-core.js / 02-nss-silnik-meczowy.js). Nie ma tu liczb
  // "na oko": wyżej gra i tak przycina, niżej tracisz bonus.
  const LOCKS = {
    // --- OVR ---------------------------------------------------------------
    overall: TARGET,
    grajewskiOverallCap: CAP,          // overallCap() = max(99|125, to pole)
    peakOverall: TARGET,
    legendPeakOverall: TARGET,

    // --- cechy widoczne w panelu ------------------------------------------
    professionalism: 100,              // clamp(...,0,100); profMod = +3 (maks)
    recognition: 100,                  // medialność, clamp(...,0,100)
    loyalty: 15,                        // clamp(...,0,15) → w silniku meczowym "teammates" = 100
    injuryRisk: 0,                      // + środowisko -3 → clamp(...,3,50) = 3%, absolutna podłoga

    // --- cechy ukryte ------------------------------------------------------
    talent: 100,                        // talentChance = clamp(8+talent*.35,12,43) → 43, maks
    // Środowisko klubu: score = rand(-16,14) + round((adaptability-60)/14) + lojalność.
    // Powyżej 14 punktów wychodzi WYJĄTKOWE: rozwój ×1.65, ryzyko urazu -3 p.p.,
    // szansa na złe zdarzenie 0%. 1000 przebija najgorszy możliwy rzut z zapasem.
    adaptability: 1000,

    // --- dyspozycja sezonu -------------------------------------------------
    // rollSeasonForm() bierze wymuszony rzut zamiast losowego. "SEZON ŻYCIA"
    // jest ostatnim przedziałem tabeli, więc 100 zawsze trafia w jego szczyt:
    // produkcja ×1.65, hierarchia +50, ocena +10, premia rozwojowa +3.
    forcedSeasonFormRoll: 100,
    forcedSeasonFormReason: 'Dyspozycja ustawiona na stałe.',
    forcedSeasonFormClubName: null,

    // --- gole i asysty -----------------------------------------------------
    // goalLambda i assistLambda mnożą się wprost przez te dwa pola (fabrycznie
    // 0.86-1.14). poisson() ma twardy licznik k<60, więc 59 to sufit sezonu -
    // 200 wysyca go dla każdej pozycji, także dla obrońcy.
    finishingBias: 200,
    creativeBias: 200,
    foot: 'Lewa',                       // footProduction 1.01 (i mniej straconych u bramkarza)

    // --- mecz decydujący (silnik meczowy) ---------------------------------
    isCaptain: true,                    // roleBonus +1 do zaangażowania, +0.6 do siły zespołu
    activePlayerEventMultiplier: 2,     // engine: clamp(...,1,2) → 2 to maks
    status: 'Gwiazda zespołu',          // cokolwiek innego niż "Rezerwowy" trzyma cię w pierwszym składzie
    boost: 25,                          // clamp(...,-20,25); szansa na grę i tak siedzi na 97%

    // --- dostępność: kary, które gra nakłada na następny sezon -------------
    // Oba pola gra tylko OBNIŻA (Math.min(...,0.8)) i sprawdza przez "< 1".
    // Zablokowane na 1 kasują zawieszenia i pourazowe cięcia meczów/minut.
    nextAppsFactor: 1,
    nextMinutesFactor: 1,
    nextAppsReason: null,
    nationalSuspensionMatches: 0,
    lowAppsStreak: 0,                   // podnosi szansę, że klub cię wypycha
    corruptionShadow: 0,                // -28 p.p. do transferu w górę
    corruptionPlan: null,               // bez planu nie ma dyskwalifikacji na sezon

    // --- rynek transferowy -------------------------------------------------
    marketBonus: 100,                   // marketHit = rand(1,100) <= marketBonus → zawsze
    agentMarketJump: 6,                 // naturalMax = min(6, +1+skok) → zawsze najwyższy poziom
    extraMarketOffer: true,             // 10 kart ofert zamiast 4
    marketLockSeasons: 0,
    blockMarketOnce: false,
    skipMarketOnce: false,
    forceNoRenewClubName: null,
    noRenewClubName: null,
    noRenewAfterAge: null,

    // --- status i długość kariery -----------------------------------------
    seniorInternational: true,          // +25 p.p. do zagranicy, otwiera bramki klubów tier 1-2
    // Ukryty twardy limit wieku (fabrycznie rand(52,61)). shouldRetire() to
    // "Number.isFinite(hardRetirementAge) && age >= hardRetirementAge", więc
    // Infinity wywraca cały warunek na false. Bonus: JSON.stringify zapisuje
    // Infinity jako null, a normalizeLoadedState tego pola nie odtwarza -
    // Number.isFinite(null) też jest false, więc limit zostaje wyłączony
    // nawet po wczytaniu zapisu, bez ponownego wklejania skryptu.
    hardRetirementAge: Infinity,
    // Siatka bezpieczeństwa na jedyne pozostałe wymuszone zakończenie:
    // przegrany mecz "Przyjaciele Andrzeja Grajewskiego" woła retire() wprost,
    // bez względu na wiek. Zablokowana flaga nie pozwala kariery zamknąć -
    // gra przełączy tylko widok, a wrocDoGry() wraca do panelu.
    retired: false,
    legendUnlocked: true,               // normalnie: dwa sezony z OVR równym dokładnie 99
    legendEraActive: true
  };

  // Pola, które gra pokazuje w panelu - odświeżamy je od razu, bez czekania
  // na następny render().
  const PAINT = {
    overall:         ['#overallValue',         v => `${v}`],
    professionalism: ['#professionalismValue', v => `${v}/100`],
    recognition:     ['#recognitionValue',     v => `${v}/100`],
    loyalty:         ['#loyaltyValue',         v => `${v}/15`],
    injuryRisk:      ['#injuryRiskValue',      v => `${v}%`],
    status:          ['#statusValue',          v => `${v}`]
  };

  // The whole career lives in a closure inside the game script, so there is no
  // global to poke. The one moment the game hands that object to something we
  // can intercept is JSON.stringify() inside "zapisz grę" - so we fire a
  // throwaway save, keep the reference, and delete the slot we just created.
  function grabState() {
    const originalStringify = JSON.stringify;
    const keysBefore = new Set(Object.keys(localStorage));
    const indexBefore = localStorage.getItem(SLOT_INDEX_KEY);
    let found = null;

    JSON.stringify = function (value, ...rest) {
      if (value && typeof value === 'object' && value.state && typeof value.state.overall === 'number') {
        found = value.state;
      }
      return originalStringify.call(JSON, value, ...rest);
    };

    try {
      q('#optionsBtn')?.click();
      const saveBtn = q('#saveGameBtn');
      if (saveBtn && !saveBtn.classList.contains('hidden')) {
        saveBtn.click();
        const slots = [...document.querySelectorAll('#saveGameSlots button')];
        // the last entry is always a fresh, empty slot - nothing to overwrite
        slots[slots.length - 1]?.click();
      }
    } finally {
      JSON.stringify = originalStringify;
      Object.keys(localStorage)
        .filter(key => key.startsWith(SLOT_PREFIX) && !keysBefore.has(key))
        .forEach(key => localStorage.removeItem(key));
      if (indexBefore === null) localStorage.removeItem(SLOT_INDEX_KEY);
      else localStorage.setItem(SLOT_INDEX_KEY, indexBefore);
      q('#saveGameClose')?.click();
      q('#optionsClose')?.click();
    }
    return found;
  }

  const isLive = obj => !!obj && typeof obj.overall === 'number' && 'careerSeasons' in obj;
  const state = grabState() || (isLive(window.pps) ? window.pps : null);

  if (!state) {
    console.log('%c✗ Nie udało się złapać stanu gry.', 'color:#c0392b;font-weight:bold');
    console.log('Skrypt łapie stan przez zapis gry, a ten działa tylko gdy masz klub i jesteś między sezonami, bez czekającego pytania, meczu ani turnieju. Rozstrzygnij co trzeba i wklej jeszcze raz.');
    return;
  }

  window.pps = state;
  const locked = new Set();

  function paint() {
    Object.entries(PAINT).forEach(([key, [sel, fmt]]) => {
      const el = q(sel);
      if (el) el.textContent = fmt(LOCKS[key]);
    });
    // Szansa na grę siedzi w domknięciu gry, więc do samego odświeżenia panelu
    // powtarzamy tu wzór projectedStartChance() jeden do jednego. Bez tego
    // panel pokazywałby stary procent aż do końca najbliższego sezonu.
    const el = q('#playChanceValue');
    const club = state.club;
    if (el && club && !club.noClub) {
      const gap = LOCKS.overall - club.strength;
      const raw = 48 + gap * 4 + (LOCKS.professionalism - 50) * .18 + LOCKS.boost + Math.min(7, LOCKS.loyalty * .65);
      el.textContent = `${Math.round(Math.min(97, Math.max(gap <= -25 ? 1 : 4, raw)))}%`;
    }
  }

  // Jednorazowe przypisanie nie wystarcza: gra co sezon dolicza ryzyko urazu,
  // przelicza medialność i status od zera, zeruje lojalność przy transferze,
  // zużywa wymuszony rzut dyspozycji i kasuje bonusy rynkowe. Getter bez
  // działającego settera przepuszcza te zapisy w próżnię - i nie wywala błędu
  // nawet w trybie strict, bo setter formalnie istnieje. Czyta przy tym LOCKS
  // na żywo, więc ovr() może później zmienić wartość bez zdejmowania blokady.
  window.maxAll = function () {
    Object.keys(LOCKS).forEach(key => {
      if (locked.has(key)) return;
      try {
        Object.defineProperty(state, key, {
          configurable: true,
          enumerable: true,
          get: () => LOCKS[key],
          set: () => {}
        });
        locked.add(key);
      } catch (e) {
        state[key] = LOCKS[key];
      }
    });
    paint();
    console.log(`%c✓ ${locked.size} pól zablokowanych na maksie`, 'color:#1e8449;font-weight:bold');
    return { ...LOCKS };
  };

  window.unlockAll = function () {
    locked.forEach(key => {
      const current = state[key];
      delete state[key];
      state[key] = current;
    });
    locked.clear();
    console.log('Blokady zdjęte - gra znowu rządzi wszystkimi polami.');
  };

  // retire() przełącza widok, zanim zdąży zapisać flagę, więc po wymuszonym
  // zakończeniu trzeba tylko wrócić na ekran kariery. Stan pozostaje nietknięty.
  window.wrocDoGry = function () {
    q('#retirementView')?.classList.add('hidden');
    q('#careerView')?.classList.remove('hidden');
    q('#decisionBox')?.classList.add('hidden');
    q('#playSeasonBtn')?.classList.remove('hidden');
    q('#saveGameBtn')?.classList.remove('hidden');
    q('#newCareerBtn')?.classList.remove('hidden');
    paint();
    console.log('Wróciłeś do kariery. Kliknij ROZEGRAJ SEZON.');
  };

  window.ovr = function (value = TARGET) {
    const wanted = Math.round(Number(value));
    if (!Number.isFinite(wanted) || wanted < 1) {
      console.log('%c✗ Podaj liczbę, np. ovr(500)', 'color:#c0392b');
      return LOCKS.overall;
    }
    const target = Math.min(CAP, wanted);
    const before = state.overall;
    LOCKS.overall = target;
    LOCKS.peakOverall = Math.max(LOCKS.peakOverall, target);
    LOCKS.legendPeakOverall = LOCKS.peakOverall;
    if (!locked.has('overall')) {
      state.grajewskiOverallCap = CAP;
      state.overall = target;
      state.peakOverall = LOCKS.peakOverall;
    }
    paint();
    console.log(`%cOVR ${before} → ${target}${target !== wanted ? ` (sufit ${CAP})` : ''}`, 'color:#1e8449;font-weight:bold');
    return target;
  };

  console.log(`%c✓ ${state.name}`, 'color:#1e8449;font-weight:bold');
  window.maxAll();
  console.table(Object.entries(LOCKS).map(([pole, wartosc]) => ({ pole, wartosc })));
  console.log('%cCzego już nie da się podnieść bez łatania silnika:', 'font-weight:bold');
  console.log([
    '• gole/asysty: poisson() ma licznik k<60, więc 59 na sezon to sufit - bias 200 wysyca go zawsze',
    '• minuty: apps × rand(68,88), maksimum 88 na mecz (u bramkarza 90) - rzut siedzi w domknięciu',
    '• mecze: jedna próba na kolejkę przy szansie 97%, plus rotacja; ~33-34 z 34',
    '• uraz: clamp(ryzyko+środowisko, 3, 50) - 3% zostaje nawet przy ryzyku 0 i WYJĄTKOWYM klubie',
    '• szansa na grę i siła vs rywal: clamp na 97% / 1.42 / 1.18 - samo OVR już je wysyca',
    '• zdarzenia po 46. roku życia: quietChance dochodzi do 100% i każdy rok mija "bez historii" - to stała w kodzie, bez pola w stanie'
  ].join('\n'));
  console.log('%cKoniec kariery:', 'font-weight:bold', 'twardy limit wieku wyłączony (hardRetirementAge = Infinity), a flaga retired zablokowana. Jeśli gra i tak pokaże ekran podsumowania, wpisz wrocDoGry(). "KONIEC KARIERY" na rynku zostaje twoją decyzją.');
  console.log('%cNie ruszam guaranteedForeignOffers:', 'font-weight:bold', 'wstawia do 40 kart zagranicznych na PRZÓD listy, a widać tylko 10 - wypchnęłoby najlepsze oferty wygenerowane przez marketBonus i agentMarketJump.');
  console.log('ovr(500) zmienia OVR • maxAll() / unlockAll() • pps to cały stan • LOCKS przez pps, np. pps.finishingBias');
  console.log('Po wczytaniu zapisu gra podmienia obiekt stanu, więc wklej skrypt jeszcze raz.');
})();
