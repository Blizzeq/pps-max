# pps-max

Skrypt do konsoli przeglądarki, który maksuje karierę w [Polskim Piłkarzu Simulatorze](https://www.tetrycy.com.pl/polskipilkarzsimulator/1.64/) — darmowej grze od Tetrycy.

Ciekawe w tym nie było wpisanie dużych liczb, tylko znalezienie krawędzi. Gra prawie każdą cechę przepuszcza przez `clamp()`, więc powyżej pewnej wartości nic już nie rośnie, a poniżej tracisz bonus. Lojalność ma maksimum 15, nie 100. Ryzyko urazu ustawione na zero nadal daje 3%, bo silnik ma tam podłogę. Gole zatrzymują się na 59 na sezon, bo `poisson()` ma licznik `k<60` i żaden mnożnik tego nie przebije. Cały skrypt to lista takich krawędzi.

## Jak użyć

Zacznij karierę, żeby mieć klub, i zatrzymaj się między sezonami — bez czekającej decyzji, meczu ani turnieju. Otwórz konsolę (`F12`, zakładka *Console*) i wklej całą treść [`pps-max.js`](pps-max.js). Panel odświeży się od razu.

Skrypt działa wyłącznie u ciebie w przeglądarce, na zapisie w `localStorage`. Po wczytaniu zapisu gra podmienia obiekt stanu, więc wklej go ponownie.

W konsoli zostają cztery rzeczy: `ovr(500)` ustawia OVR, `maxAll()` zakłada blokady od nowa, `unlockAll()` je zdejmuje, `wrocDoGry()` wraca do panelu, gdyby gra pokazała ekran końca kariery. Do tego `pps`, czyli cały obiekt stanu.

## Jak skrypt dostaje się do stanu

Kariera siedzi w domknięciu skryptu gry i nie ma żadnej globalnej zmiennej, przez którą można by wejść. Jedyny moment, kiedy gra podaje ten obiekt czemuś przechwytywalnemu, to `JSON.stringify()` wewnątrz „zapisz grę". Skrypt podmienia więc na chwilę `JSON.stringify`, odpala zapis-atrapę, zatrzymuje referencję i kasuje slot, który przy okazji powstał.

Samo przypisanie wartości nie wystarcza. Gra co sezon dolicza ryzyko urazu, przelicza medialność i status od zera, zeruje lojalność przy transferze, zużywa wymuszony rzut dyspozycji i kasuje bonusy rynkowe. Dlatego każde pole zostaje przykryte getterem bez działającego settera (`Object.defineProperty`). Zapisy gry lecą w próżnię i nie wywalają błędu nawet w trybie strict, bo setter formalnie istnieje.

## Skąd te konkretne liczby

| Pole | Wartość | Skąd |
|---|---|---|
| `loyalty` | 15 | wszystkie clampy to `clamp(...,0,15)`, panel pokazuje `15/15`; w silniku meczowym daje `teammates = 100` |
| `injuryRisk` | 0 | zerwanie więzadeł ma warunek `injuryRisk < 40 → 0%`, więc przy zerze znika całkowicie |
| `adaptability` | 1000 | środowisko klubu to `rand(-16,14) + round((adaptability-60)/14) + lojalność`; powyżej 14 punktów wychodzi WYJĄTKOWE — rozwój ×1.65, ryzyko urazu −3 p.p., szansa na złe zdarzenie 0% |
| `forcedSeasonFormRoll` | 100 | `rollSeasonForm()` bierze wymuszony rzut zamiast losowego, a SEZON ŻYCIA jest ostatnim przedziałem tabeli, więc 100 trafia w jego szczyt: produkcja ×1.65, hierarchia +50, ocena +10 |
| `finishingBias`, `creativeBias` | 200 | mnożą się wprost przez `goalLambda` i `assistLambda`; 200 wysyca licznik `poisson()` dla każdej pozycji, także dla obrońcy |
| `nextAppsFactor`, `nextMinutesFactor` | 1 | gra te pola tylko obniża (`Math.min(...,0.8)`) i sprawdza warunkiem `< 1`, więc jedynka kasuje zawieszenia i pourazowe cięcia meczów |
| `activePlayerEventMultiplier` | 2 | silnik meczowy robi `clamp(...,1,2)`; razem z `isCaptain` daje 20 własnych zdarzeń w meczu, czyli sufit |
| `hardRetirementAge` | `Infinity` | ukryty limit wieku, fabrycznie `rand(52,61)`; `shouldRetire()` to `Number.isFinite(pole) && wiek >= pole`, więc `Infinity` wywraca warunek na `false` |

Ostatnie pole ma efekt uboczny na plus: `JSON.stringify` zapisuje `Infinity` jako `null`, a `normalizeLoadedState` tego pola nie odtwarza. `Number.isFinite(null)` też jest `false`, więc limit wieku zostaje wyłączony nawet po wczytaniu zapisu.

## Gdzie kończą się możliwości

Gole i asysty stoją na 59 na sezon przez licznik `k<60` w `poisson()`. Minuty to `mecze × rand(68,88)`, a ten rzut siedzi w domknięciu. Meczów wychodzi realnie 33–34 z 34, bo silnik rzuca raz na kolejkę przy szansie 97%. Uraz ma podłogę `clamp(ryzyko + środowisko, 3, 50)`, więc 3% zostaje nawet przy zerowym ryzyku i wyjątkowym klubie. Po 46. roku życia `quietChance` dochodzi do 100% i każdy rok mija bez zdarzeń — to stała w kodzie, bez pola w stanie.

Trzy rzeczy zostawiłem świadomie. `guaranteedForeignOffers` wygląda na darmowy zysk, ale wstawia do 40 kart zagranicznych na przód listy ofert, a w oknie widać tylko 10, więc wypchnęłoby najlepsze oferty wygenerowane przez `marketBonus` i `agentMarketJump`. `foot: 'Lewa'` daje mnożnik 1.01, ale zmienia „Lepszą nogę" w profilu, więc jeśli ci to przeszkadza, usuń linię. OVR 100 000 000 wchodzi do wzorów na wycenę i kontrakt, więc kwoty robią się absurdalne; nic się nie wysypie, ale `ovr(300)` daje ten sam efekt z sensownymi liczbami.

## Zastrzeżenia

Projekt niezależny, niepowiązany z Tetrycy, nie zawiera kodu gry. Testowane na wersji 1.64 — nowsze mogą zmienić nazwy pól i wzory.

[MIT](LICENSE)
