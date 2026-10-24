// Le catalogue de toutes les fonctions de Reikna, en français : leur rubrique, leurs arguments et ce
// qu'elles font. Il sert à l'autocomplétion pendant la frappe (=SO… → SOMME, SOMME.SI…), à la bulle
// d'aide des arguments, et à la fenêtre « Toutes les fonctions » (bouton fx, Maj+F3).
//
// Chaque ligne : NOM ANGLAIS | rubrique | arguments | description.
// Le nom français vient du moteur de calcul (HyperFormula, langue frFR), sauf quelques corrections
// (NOMS_FR plus bas). Les arguments entre crochets sont facultatifs ; « … » = on peut en mettre d'autres.
// Les fonctions de la rubrique « Compatibilité » sont les anciennes versions gardées par Excel.

const Fonctions = (() => {
  const LIGNES = `
SUM|Maths|nombre1; [nombre2]; …|Additionne tous les nombres (et les plages).
SUMIF|Maths|plage; critère; [plage_somme]|Additionne les cellules qui remplissent une condition (ex. ">100").
SUMIFS|Maths|plage_somme; plage_critères1; critère1; …|Additionne les cellules qui remplissent plusieurs conditions.
SUMPRODUCT|Maths|tableau1; [tableau2]; …|Multiplie les tableaux élément par élément, puis additionne.
SUMSQ|Maths|nombre1; [nombre2]; …|Somme des carrés.
SUMX2MY2|Maths|tableau_x; tableau_y|Somme des différences des carrés (x² − y²).
SUMX2PY2|Maths|tableau_x; tableau_y|Somme des sommes des carrés (x² + y²).
SUMXMY2|Maths|tableau_x; tableau_y|Somme des carrés des différences ((x − y)²).
PRODUCT|Maths|nombre1; [nombre2]; …|Multiplie tous les nombres.
SUBTOTAL|Maths|n°_fonction; plage1; …|Sous-total (1 moyenne, 2 nb, 9 somme…) qui ignore les autres sous-totaux.
ABS|Maths|nombre|Valeur absolue (sans le signe).
ROUND|Maths|nombre; nb_chiffres|Arrondit au nombre de décimales voulu.
ROUNDUP|Maths|nombre; nb_chiffres|Arrondit en s'éloignant de zéro.
ROUNDDOWN|Maths|nombre; nb_chiffres|Arrondit en se rapprochant de zéro.
MROUND|Maths|nombre; multiple|Arrondit au multiple le plus proche.
INT|Maths|nombre|Partie entière (arrondi vers le bas).
TRUNC|Maths|nombre; [nb_chiffres]|Coupe les décimales sans arrondir.
CEILING|Maths|nombre; précision|Arrondit au multiple supérieur.
CEILING.MATH|Maths|nombre; [précision]; [mode]|Arrondit au multiple supérieur (version moderne).
CEILING.PRECISE|Maths|nombre; [précision]|Arrondit au multiple supérieur, quel que soit le signe.
ISO.CEILING|Maths|nombre; [précision]|Arrondit au multiple supérieur (norme ISO).
FLOOR|Maths|nombre; précision|Arrondit au multiple inférieur.
FLOOR.MATH|Maths|nombre; [précision]; [mode]|Arrondit au multiple inférieur (version moderne).
FLOOR.PRECISE|Maths|nombre; [précision]|Arrondit au multiple inférieur, quel que soit le signe.
EVEN|Maths|nombre|Arrondit au nombre pair supérieur.
ODD|Maths|nombre|Arrondit au nombre impair supérieur.
MOD|Maths|nombre; diviseur|Reste de la division.
QUOTIENT|Maths|numérateur; dénominateur|Partie entière de la division.
POWER|Maths|nombre; puissance|Élève à la puissance (comme ^).
SQRT|Maths|nombre|Racine carrée.
SQRTPI|Maths|nombre|Racine carrée de (nombre × π).
EXP|Maths|nombre|e élevé à la puissance.
LN|Maths|nombre|Logarithme népérien.
LOG|Maths|nombre; [base]|Logarithme (base 10 par défaut).
LOG10|Maths|nombre|Logarithme en base 10.
PI|Maths||Le nombre π (3,14159…).
SIGN|Maths|nombre|Signe : 1, 0 ou −1.
FACT|Maths|nombre|Factorielle (n!).
FACTDOUBLE|Maths|nombre|Double factorielle (n!!).
COMBIN|Maths|n; k|Nombre de combinaisons de k parmi n.
COMBINA|Maths|n; k|Combinaisons avec répétitions.
MULTINOMIAL|Maths|nombre1; [nombre2]; …|Coefficient multinomial.
GCD|Maths|nombre1; [nombre2]; …|Plus grand commun diviseur.
LCM|Maths|nombre1; [nombre2]; …|Plus petit commun multiple.
RAND|Maths||Nombre au hasard entre 0 et 1 (change à chaque calcul).
RANDBETWEEN|Maths|min; max|Nombre entier au hasard entre deux bornes.
ROMAN|Maths|nombre; [forme]|Écrit un nombre en chiffres romains.
ARABIC|Maths|texte|Convertit des chiffres romains en nombre.
ISEVEN|Maths|nombre|VRAI si le nombre est pair.
ISODD|Maths|nombre|VRAI si le nombre est impair.
SERIESSUM|Maths|x; n; m; coefficients|Somme d'une série entière.
MMULT|Maths|matrice1; matrice2|Produit de deux matrices.
DEGREES|Trigonométrie|angle|Radians → degrés.
RADIANS|Trigonométrie|angle|Degrés → radians.
SIN|Trigonométrie|angle|Sinus (angle en radians).
COS|Trigonométrie|angle|Cosinus (angle en radians).
TAN|Trigonométrie|angle|Tangente (angle en radians).
COT|Trigonométrie|angle|Cotangente.
SEC|Trigonométrie|angle|Sécante.
CSC|Trigonométrie|angle|Cosécante.
ASIN|Trigonométrie|nombre|Arc sinus.
ACOS|Trigonométrie|nombre|Arc cosinus.
ATAN|Trigonométrie|nombre|Arc tangente.
ATAN2|Trigonométrie|x; y|Arc tangente à partir des coordonnées x et y.
ACOT|Trigonométrie|nombre|Arc cotangente.
SINH|Trigonométrie|nombre|Sinus hyperbolique.
COSH|Trigonométrie|nombre|Cosinus hyperbolique.
TANH|Trigonométrie|nombre|Tangente hyperbolique.
COTH|Trigonométrie|nombre|Cotangente hyperbolique.
SECH|Trigonométrie|nombre|Sécante hyperbolique.
CSCH|Trigonométrie|nombre|Cosécante hyperbolique.
ASINH|Trigonométrie|nombre|Arc sinus hyperbolique.
ACOSH|Trigonométrie|nombre|Arc cosinus hyperbolique.
ATANH|Trigonométrie|nombre|Arc tangente hyperbolique.
ACOTH|Trigonométrie|nombre|Arc cotangente hyperbolique.
AVERAGE|Statistiques|nombre1; [nombre2]; …|Moyenne des nombres.
AVERAGEA|Statistiques|valeur1; [valeur2]; …|Moyenne en comptant le texte comme 0 et VRAI comme 1.
AVERAGEIF|Statistiques|plage; critère; [plage_moyenne]|Moyenne des cellules qui remplissent une condition.
MEDIAN|Statistiques|nombre1; [nombre2]; …|Valeur du milieu.
MAX|Statistiques|nombre1; [nombre2]; …|Plus grande valeur.
MIN|Statistiques|nombre1; [nombre2]; …|Plus petite valeur.
MAXA|Statistiques|valeur1; [valeur2]; …|Plus grande valeur, texte compté comme 0.
MINA|Statistiques|valeur1; [valeur2]; …|Plus petite valeur, texte compté comme 0.
MAXIFS|Statistiques|plage_max; plage_critères1; critère1; …|Plus grande valeur parmi les cellules qui remplissent les conditions.
MINIFS|Statistiques|plage_min; plage_critères1; critère1; …|Plus petite valeur parmi les cellules qui remplissent les conditions.
LARGE|Statistiques|tableau; k|La k-ième plus grande valeur.
SMALL|Statistiques|tableau; k|La k-ième plus petite valeur.
COUNT|Statistiques|valeur1; [valeur2]; …|Compte les cellules qui contiennent un nombre.
COUNTA|Statistiques|valeur1; [valeur2]; …|Compte les cellules non vides.
COUNTBLANK|Statistiques|plage|Compte les cellules vides.
COUNTIF|Statistiques|plage; critère|Compte les cellules qui remplissent une condition.
COUNTIFS|Statistiques|plage_critères1; critère1; …|Compte les cellules qui remplissent plusieurs conditions.
COUNTUNIQUE|Statistiques|valeur1; [valeur2]; …|Compte les valeurs différentes.
STDEV.S|Statistiques|nombre1; [nombre2]; …|Écart type d'un échantillon.
STDEV.P|Statistiques|nombre1; [nombre2]; …|Écart type de toute la population.
STDEVA|Statistiques|valeur1; [valeur2]; …|Écart type d'un échantillon, texte compté comme 0.
STDEVPA|Statistiques|valeur1; [valeur2]; …|Écart type de la population, texte compté comme 0.
VAR.S|Statistiques|nombre1; [nombre2]; …|Variance d'un échantillon.
VAR.P|Statistiques|nombre1; [nombre2]; …|Variance de toute la population.
VARA|Statistiques|valeur1; [valeur2]; …|Variance d'un échantillon, texte compté comme 0.
VARPA|Statistiques|valeur1; [valeur2]; …|Variance de la population, texte compté comme 0.
AVEDEV|Statistiques|nombre1; [nombre2]; …|Écart moyen par rapport à la moyenne.
DEVSQ|Statistiques|nombre1; [nombre2]; …|Somme des carrés des écarts à la moyenne.
GEOMEAN|Statistiques|nombre1; [nombre2]; …|Moyenne géométrique.
HARMEAN|Statistiques|nombre1; [nombre2]; …|Moyenne harmonique.
PERCENTILE.INC|Statistiques|tableau; k|Centile (k entre 0 et 1, bornes comprises).
PERCENTILE.EXC|Statistiques|tableau; k|Centile (k entre 0 et 1, bornes exclues).
QUARTILE.INC|Statistiques|tableau; quart|Quartile (0 à 4).
QUARTILE.EXC|Statistiques|tableau; quart|Quartile (1 à 3, bornes exclues).
CORREL|Statistiques|tableau1; tableau2|Coefficient de corrélation.
PEARSON|Statistiques|tableau1; tableau2|Coefficient de corrélation de Pearson.
RSQ|Statistiques|y_connus; x_connus|Coefficient de détermination (R²).
SLOPE|Statistiques|y_connus; x_connus|Pente de la droite de régression.
STEYX|Statistiques|y_connus; x_connus|Erreur type de la régression.
COVARIANCE.P|Statistiques|tableau1; tableau2|Covariance de la population.
COVARIANCE.S|Statistiques|tableau1; tableau2|Covariance d'un échantillon.
SKEW|Statistiques|nombre1; [nombre2]; …|Asymétrie d'une distribution (échantillon).
SKEW.P|Statistiques|nombre1; [nombre2]; …|Asymétrie d'une distribution (population).
STANDARDIZE|Statistiques|x; moyenne; écart_type|Valeur centrée réduite.
FISHER|Statistiques|x|Transformation de Fisher.
FISHERINV|Statistiques|y|Inverse de la transformation de Fisher.
CONFIDENCE.NORM|Statistiques|alpha; écart_type; taille|Intervalle de confiance (loi normale).
CONFIDENCE.T|Statistiques|alpha; écart_type; taille|Intervalle de confiance (loi de Student).
MAXPOOL|Statistiques|plage; taille_fenêtre; [pas]|Plus grande valeur de chaque fenêtre (sous-échantillonnage).
MEDIANPOOL|Statistiques|plage; taille_fenêtre; [pas]|Médiane de chaque fenêtre (sous-échantillonnage).
Z.TEST|Statistiques|tableau; x; [sigma]|Test Z (probabilité unilatérale).
T.TEST|Statistiques|tableau1; tableau2; uni_bilatéral; type|Test de Student.
F.TEST|Statistiques|tableau1; tableau2|Test F (égalité des variances).
CHISQ.TEST|Statistiques|plage_observée; plage_attendue|Test du khi-deux.
NORM.DIST|Lois statistiques|x; moyenne; écart_type; cumulative|Loi normale.
NORM.INV|Lois statistiques|probabilité; moyenne; écart_type|Inverse de la loi normale.
NORM.S.DIST|Lois statistiques|z; cumulative|Loi normale centrée réduite.
NORM.S.INV|Lois statistiques|probabilité|Inverse de la loi normale centrée réduite.
LOGNORM.DIST|Lois statistiques|x; moyenne; écart_type; cumulative|Loi log-normale.
LOGNORM.INV|Lois statistiques|probabilité; moyenne; écart_type|Inverse de la loi log-normale.
BINOM.DIST|Lois statistiques|succès; essais; probabilité; cumulative|Loi binomiale.
BINOM.INV|Lois statistiques|essais; probabilité; alpha|Plus petit nombre de succès dont la loi binomiale cumulée dépasse alpha.
NEGBINOM.DIST|Lois statistiques|échecs; succès; probabilité; cumulative|Loi binomiale négative.
HYPGEOM.DIST|Lois statistiques|succès_éch; taille_éch; succès_pop; taille_pop; cumulative|Loi hypergéométrique.
POISSON.DIST|Lois statistiques|x; moyenne; cumulative|Loi de Poisson.
EXPON.DIST|Lois statistiques|x; lambda; cumulative|Loi exponentielle.
GAMMA|Lois statistiques|nombre|Fonction Gamma.
GAMMA.DIST|Lois statistiques|x; alpha; bêta; cumulative|Loi Gamma.
GAMMA.INV|Lois statistiques|probabilité; alpha; bêta|Inverse de la loi Gamma.
GAMMALN|Lois statistiques|x|Logarithme de la fonction Gamma.
GAMMALN.PRECISE|Lois statistiques|x|Logarithme de la fonction Gamma (précis).
BETA.DIST|Lois statistiques|x; alpha; bêta; cumulative; [A]; [B]|Loi bêta.
BETA.INV|Lois statistiques|probabilité; alpha; bêta; [A]; [B]|Inverse de la loi bêta.
CHISQ.DIST|Lois statistiques|x; degrés_liberté; cumulative|Loi du khi-deux.
CHISQ.DIST.RT|Lois statistiques|x; degrés_liberté|Loi du khi-deux (queue droite).
CHISQ.INV|Lois statistiques|probabilité; degrés_liberté|Inverse de la loi du khi-deux.
CHISQ.INV.RT|Lois statistiques|probabilité; degrés_liberté|Inverse de la loi du khi-deux (queue droite).
F.DIST|Lois statistiques|x; degrés1; degrés2; cumulative|Loi F.
F.DIST.RT|Lois statistiques|x; degrés1; degrés2|Loi F (queue droite).
F.INV|Lois statistiques|probabilité; degrés1; degrés2|Inverse de la loi F.
F.INV.RT|Lois statistiques|probabilité; degrés1; degrés2|Inverse de la loi F (queue droite).
T.DIST|Lois statistiques|x; degrés_liberté; cumulative|Loi de Student.
T.DIST.2T|Lois statistiques|x; degrés_liberté|Loi de Student bilatérale.
T.DIST.RT|Lois statistiques|x; degrés_liberté|Loi de Student (queue droite).
T.INV|Lois statistiques|probabilité; degrés_liberté|Inverse de la loi de Student.
T.INV.2T|Lois statistiques|probabilité; degrés_liberté|Inverse de la loi de Student bilatérale.
WEIBULL.DIST|Lois statistiques|x; alpha; bêta; cumulative|Loi de Weibull.
GAUSS|Lois statistiques|z|Probabilité qu'une variable normale soit entre la moyenne et z écarts types.
PHI|Lois statistiques|x|Densité de la loi normale centrée réduite.
ERF|Lois statistiques|limite_inf; [limite_sup]|Fonction d'erreur.
ERFC|Lois statistiques|x|Fonction d'erreur complémentaire.
IF|Logique|test; valeur_si_vrai; [valeur_si_faux]|Renvoie une valeur si la condition est vraie, une autre sinon.
IFS|Logique|test1; valeur1; [test2; valeur2]; …|Renvoie la valeur de la première condition vraie.
SWITCH|Logique|expression; valeur1; résultat1; …; [par_défaut]|Compare une expression à une liste de valeurs.
IFERROR|Logique|valeur; valeur_si_erreur|Remplace une erreur (#DIV/0!…) par une autre valeur.
IFNA|Logique|valeur; valeur_si_na|Remplace l'erreur #N/A par une autre valeur.
AND|Logique|logique1; [logique2]; …|VRAI si toutes les conditions sont vraies.
OR|Logique|logique1; [logique2]; …|VRAI si au moins une condition est vraie.
XOR|Logique|logique1; [logique2]; …|VRAI si un nombre impair de conditions sont vraies.
NOT|Logique|logique|Inverse VRAI et FAUX.
TRUE|Logique||La valeur VRAI.
FALSE|Logique||La valeur FAUX.
CHOOSE|Logique|n°; valeur1; [valeur2]; …|Choisit une valeur dans une liste d'après son numéro.
VLOOKUP|Recherche|valeur; tableau; n°_colonne; [valeur_proche]|Cherche dans la 1re colonne et renvoie la valeur de la colonne voulue (mettre FAUX pour une valeur exacte).
HLOOKUP|Recherche|valeur; tableau; n°_ligne; [valeur_proche]|Cherche dans la 1re ligne et renvoie la valeur de la ligne voulue.
XLOOKUP|Recherche|valeur; tableau_recherche; tableau_renvoyé; [si_absent]; [mode_correspondance]; [mode_recherche]|Cherche une valeur et renvoie celle qui lui correspond (successeur de RECHERCHEV).
MATCH|Recherche|valeur; tableau; [type]|Position d'une valeur dans une plage (0 = exacte).
INDEX|Recherche|tableau; n°_ligne; [n°_colonne]|Valeur à une position donnée d'une plage.
OFFSET|Recherche|référence; lignes; colonnes; [hauteur]; [largeur]|Une plage décalée par rapport à une référence.
ADDRESS|Recherche|ligne; colonne; [type]; [style_A1]; [feuille]|Écrit l'adresse d'une cellule (« $B$3 »).
ROW|Recherche|[référence]|Numéro de ligne.
ROWS|Recherche|tableau|Nombre de lignes d'une plage.
COLUMN|Recherche|[référence]|Numéro de colonne.
COLUMNS|Recherche|tableau|Nombre de colonnes d'une plage.
HYPERLINK|Recherche|adresse; [nom]|Lien cliquable (Ctrl+clic pour l'ouvrir).
FORMULATEXT|Recherche|référence|Le texte de la formule d'une cellule.
TRANSPOSE|Tableaux|tableau|Échange lignes et colonnes.
FILTER|Tableaux|tableau; condition1; [condition2]; …|Ne garde que les lignes qui remplissent les conditions.
SORT|Tableaux|tableau; [n°_colonne]; [croissant]; …|Trie une plage.
UNIQUE|Tableaux|tableau|Les valeurs sans doublons.
SEQUENCE|Tableaux|lignes; [colonnes]; [début]; [pas]|Une suite de nombres (1, 2, 3…).
VSTACK|Tableaux|tableau1; [tableau2]; …|Empile des plages les unes sous les autres.
HSTACK|Tableaux|tableau1; [tableau2]; …|Met des plages côte à côte.
ARRAYFORMULA|Tableaux|formule|Calcule une formule sur des plages entières.
ARRAY_CONSTRAIN|Tableaux|tableau; lignes; colonnes|Ne garde que le début d'un tableau.
CONCATENATE|Texte|texte1; [texte2]; …|Met des textes bout à bout (comme &).
TEXTJOIN|Texte|séparateur; ignorer_vides; texte1; …|Met des textes bout à bout avec un séparateur.
LEFT|Texte|texte; [nb_car]|Les premiers caractères.
RIGHT|Texte|texte; [nb_car]|Les derniers caractères.
MID|Texte|texte; début; nb_car|Des caractères au milieu d'un texte.
LEN|Texte|texte|Nombre de caractères.
LOWER|Texte|texte|En minuscules.
UPPER|Texte|texte|En majuscules.
PROPER|Texte|texte|Majuscule au début de chaque mot.
TRIM|Texte|texte|Enlève les espaces en trop.
CLEAN|Texte|texte|Enlève les caractères non imprimables.
FIND|Texte|cherché; texte; [début]|Position d'un texte dans un autre (respecte les majuscules).
SEARCH|Texte|cherché; texte; [début]|Position d'un texte dans un autre (sans tenir compte des majuscules, accepte * et ?).
REPLACE|Texte|texte; début; nb_car; nouveau|Remplace des caractères à une position donnée.
SUBSTITUTE|Texte|texte; ancien; nouveau; [n°]|Remplace un texte par un autre.
REPT|Texte|texte; fois|Répète un texte.
EXACT|Texte|texte1; texte2|VRAI si les deux textes sont identiques (majuscules comprises).
TEXT|Texte|valeur; format|Écrit un nombre avec un format (ex. "0,00 €", "jj/mm/aaaa").
VALUE|Texte|texte|Convertit un texte en nombre.
CHAR|Texte|nombre|Le caractère de ce code.
CODE|Texte|texte|Le code du premier caractère.
UNICHAR|Texte|nombre|Le caractère Unicode de ce code.
UNICODE|Texte|texte|Le code Unicode du premier caractère.
SPLIT|Texte|texte; séparateur|Coupe un texte en morceaux sur plusieurs cellules.
T|Texte|valeur|Le texte, ou rien si ce n'est pas du texte.
N|Texte|valeur|Le nombre, ou 0 si ce n'est pas un nombre.
DATE|Date et heure|année; mois; jour|Construit une date.
TIME|Date et heure|heure; minute; seconde|Construit une heure.
TODAY|Date et heure||La date du jour.
NOW|Date et heure||La date et l'heure actuelles.
YEAR|Date et heure|date|L'année d'une date.
MONTH|Date et heure|date|Le mois (1 à 12).
DAY|Date et heure|date|Le jour du mois (1 à 31).
HOUR|Date et heure|heure|L'heure (0 à 23).
MINUTE|Date et heure|heure|Les minutes.
SECOND|Date et heure|heure|Les secondes.
WEEKDAY|Date et heure|date; [type]|Le jour de la semaine (type 2 : lundi = 1).
WEEKNUM|Date et heure|date; [type]|Le numéro de la semaine.
ISOWEEKNUM|Date et heure|date|Le numéro de semaine ISO (celui des calendriers français).
DAYS|Date et heure|date_fin; date_début|Nombre de jours entre deux dates.
DAYS360|Date et heure|date_début; date_fin; [méthode]|Jours entre deux dates sur une année de 360 jours.
DATEDIF|Date et heure|date_début; date_fin; unité|Écart entre deux dates en "Y" ans, "M" mois ou "D" jours.
EDATE|Date et heure|date; mois|La même date décalée de quelques mois.
EOMONTH|Date et heure|date; mois|Le dernier jour du mois (décalé de quelques mois).
YEARFRAC|Date et heure|date_début; date_fin; [base]|Fraction d'année entre deux dates.
NETWORKDAYS|Date et heure|date_début; date_fin; [jours_fériés]|Nombre de jours ouvrés (lundi à vendredi).
NETWORKDAYS.INTL|Date et heure|date_début; date_fin; [week-end]; [jours_fériés]|Jours ouvrés avec un week-end au choix.
WORKDAY|Date et heure|date; jours; [jours_fériés]|La date après un nombre de jours ouvrés.
WORKDAY.INTL|Date et heure|date; jours; [week-end]; [jours_fériés]|La date après des jours ouvrés, week-end au choix.
DATEVALUE|Date et heure|texte|Convertit un texte en date.
TIMEVALUE|Date et heure|texte|Convertit un texte en heure.
INTERVAL|Date et heure|secondes|Écrit une durée en secondes au format ISO (PT1H2M).
PMT|Finances|taux; nb_périodes; va; [vc]; [type]|Mensualité d'un emprunt (taux par période).
IPMT|Finances|taux; période; nb_périodes; va; [vc]; [type]|Part des intérêts dans une mensualité.
PPMT|Finances|taux; période; nb_périodes; va; [vc]; [type]|Part du capital dans une mensualité.
CUMIPMT|Finances|taux; nb_périodes; va; début; fin; type|Intérêts cumulés entre deux périodes.
CUMPRINC|Finances|taux; nb_périodes; va; début; fin; type|Capital remboursé entre deux périodes.
FV|Finances|taux; nb_périodes; vpm; [va]; [type]|Valeur future d'un placement.
FVSCHEDULE|Finances|capital; taux|Valeur future avec des taux qui changent.
PV|Finances|taux; nb_périodes; vpm; [vc]; [type]|Valeur actuelle.
NPV|Finances|taux; valeur1; [valeur2]; …|Valeur actuelle nette.
XNPV|Finances|taux; valeurs; dates|Valeur actuelle nette à dates irrégulières.
IRR|Finances|valeurs; [estimation]|Taux de rendement interne.
XIRR|Finances|valeurs; dates; [estimation]|Taux de rendement interne à dates irrégulières.
MIRR|Finances|valeurs; taux_emprunt; taux_placement|Taux de rendement interne modifié.
NPER|Finances|taux; vpm; va; [vc]; [type]|Nombre de périodes d'un emprunt ou d'un placement.
RATE|Finances|nb_périodes; vpm; va; [vc]; [type]; [estimation]|Taux d'intérêt par période.
RRI|Finances|nb_périodes; va; vc|Taux équivalent pour passer de va à vc.
PDURATION|Finances|taux; va; vc|Nombre de périodes pour atteindre une valeur.
EFFECT|Finances|taux_nominal; nb_périodes_an|Taux effectif annuel.
NOMINAL|Finances|taux_effectif; nb_périodes_an|Taux nominal annuel.
ISPMT|Finances|taux; période; nb_périodes; va|Intérêts d'une période (amortissement constant).
SLN|Finances|coût; valeur_résiduelle; durée|Amortissement linéaire.
SYD|Finances|coût; valeur_résiduelle; durée; période|Amortissement dégressif (somme des années).
DB|Finances|coût; valeur_résiduelle; durée; période; [mois]|Amortissement dégressif à taux fixe.
DDB|Finances|coût; valeur_résiduelle; durée; période; [facteur]|Amortissement dégressif à taux double.
DOLLARDE|Finances|prix_fraction; fraction|Prix en fraction → prix décimal.
DOLLARFR|Finances|prix_décimal; fraction|Prix décimal → prix en fraction.
TBILLEQ|Finances|règlement; échéance; taux|Rendement équivalent obligataire d'un bon du Trésor.
TBILLPRICE|Finances|règlement; échéance; taux|Prix d'un bon du Trésor.
TBILLYIELD|Finances|règlement; échéance; prix|Rendement d'un bon du Trésor.
ISBLANK|Information|valeur|VRAI si la cellule est vide.
ISNUMBER|Information|valeur|VRAI si c'est un nombre.
ISTEXT|Information|valeur|VRAI si c'est du texte.
ISNONTEXT|Information|valeur|VRAI si ce n'est pas du texte.
ISLOGICAL|Information|valeur|VRAI si c'est VRAI ou FAUX.
ISERROR|Information|valeur|VRAI si c'est une erreur.
ISERR|Information|valeur|VRAI si c'est une erreur autre que #N/A.
ISNA|Information|valeur|VRAI si c'est l'erreur #N/A.
ISREF|Information|valeur|VRAI si c'est une référence.
ISFORMULA|Information|référence|VRAI si la cellule contient une formule.
ISBINARY|Information|valeur|VRAI si c'est un nombre binaire valide.
NA|Information||L'erreur #N/A (valeur non disponible).
SHEET|Information|[référence]|Numéro de la feuille.
SHEETS|Information|[référence]|Nombre de feuilles.
DSUM|Base de données|base; champ; critères|Somme d'une colonne pour les lignes qui remplissent les critères.
DAVERAGE|Base de données|base; champ; critères|Moyenne d'une colonne selon des critères.
DCOUNT|Base de données|base; champ; critères|Compte les nombres d'une colonne selon des critères.
DCOUNTA|Base de données|base; champ; critères|Compte les cellules non vides selon des critères.
DMAX|Base de données|base; champ; critères|Plus grande valeur selon des critères.
DMIN|Base de données|base; champ; critères|Plus petite valeur selon des critères.
DGET|Base de données|base; champ; critères|La seule valeur qui remplit les critères.
DPRODUCT|Base de données|base; champ; critères|Produit selon des critères.
DSTDEV|Base de données|base; champ; critères|Écart type (échantillon) selon des critères.
DSTDEVP|Base de données|base; champ; critères|Écart type (population) selon des critères.
DVAR|Base de données|base; champ; critères|Variance (échantillon) selon des critères.
DVARP|Base de données|base; champ; critères|Variance (population) selon des critères.
DEC2BIN|Ingénierie|nombre; [chiffres]|Décimal → binaire.
DEC2OCT|Ingénierie|nombre; [chiffres]|Décimal → octal.
DEC2HEX|Ingénierie|nombre; [chiffres]|Décimal → hexadécimal.
BIN2DEC|Ingénierie|nombre|Binaire → décimal.
BIN2OCT|Ingénierie|nombre; [chiffres]|Binaire → octal.
BIN2HEX|Ingénierie|nombre; [chiffres]|Binaire → hexadécimal.
OCT2DEC|Ingénierie|nombre|Octal → décimal.
OCT2BIN|Ingénierie|nombre; [chiffres]|Octal → binaire.
OCT2HEX|Ingénierie|nombre; [chiffres]|Octal → hexadécimal.
HEX2DEC|Ingénierie|nombre|Hexadécimal → décimal (ex. "FF" → 255).
HEX2BIN|Ingénierie|nombre; [chiffres]|Hexadécimal → binaire.
HEX2OCT|Ingénierie|nombre; [chiffres]|Hexadécimal → octal.
DECIMAL|Ingénierie|texte; base|Un nombre écrit dans une base → décimal.
BASE|Ingénierie|nombre; base; [chiffres]|Écrit un nombre dans une autre base.
BITAND|Ingénierie|nombre1; nombre2|ET bit à bit.
BITOR|Ingénierie|nombre1; nombre2|OU bit à bit.
BITXOR|Ingénierie|nombre1; nombre2|OU exclusif bit à bit.
BITLSHIFT|Ingénierie|nombre; décalage|Décale les bits vers la gauche.
BITRSHIFT|Ingénierie|nombre; décalage|Décale les bits vers la droite.
DELTA|Ingénierie|nombre1; [nombre2]|1 si les deux nombres sont égaux, sinon 0.
BESSELI|Ingénierie|x; n|Fonction de Bessel modifiée In(x).
BESSELJ|Ingénierie|x; n|Fonction de Bessel Jn(x).
BESSELK|Ingénierie|x; n|Fonction de Bessel modifiée Kn(x).
BESSELY|Ingénierie|x; n|Fonction de Bessel Yn(x).
COMPLEX|Nombres complexes|réel; imaginaire; [suffixe]|Construit un nombre complexe (3+4i).
IMREAL|Nombres complexes|complexe|Partie réelle.
IMAGINARY|Nombres complexes|complexe|Partie imaginaire.
IMABS|Nombres complexes|complexe|Module.
IMARGUMENT|Nombres complexes|complexe|Argument (angle).
IMCONJUGATE|Nombres complexes|complexe|Conjugué.
IMSUM|Nombres complexes|complexe1; [complexe2]; …|Somme de complexes.
IMSUB|Nombres complexes|complexe1; complexe2|Différence de deux complexes.
IMPRODUCT|Nombres complexes|complexe1; [complexe2]; …|Produit de complexes.
IMDIV|Nombres complexes|complexe1; complexe2|Quotient de deux complexes.
IMPOWER|Nombres complexes|complexe; puissance|Puissance d'un complexe.
IMSQRT|Nombres complexes|complexe|Racine carrée d'un complexe.
IMEXP|Nombres complexes|complexe|Exponentielle d'un complexe.
IMLN|Nombres complexes|complexe|Logarithme népérien d'un complexe.
IMLOG10|Nombres complexes|complexe|Logarithme base 10 d'un complexe.
IMLOG2|Nombres complexes|complexe|Logarithme base 2 d'un complexe.
IMSIN|Nombres complexes|complexe|Sinus d'un complexe.
IMCOS|Nombres complexes|complexe|Cosinus d'un complexe.
IMTAN|Nombres complexes|complexe|Tangente d'un complexe.
IMCOT|Nombres complexes|complexe|Cotangente d'un complexe.
IMSEC|Nombres complexes|complexe|Sécante d'un complexe.
IMCSC|Nombres complexes|complexe|Cosécante d'un complexe.
IMSINH|Nombres complexes|complexe|Sinus hyperbolique d'un complexe.
IMCOSH|Nombres complexes|complexe|Cosinus hyperbolique d'un complexe.
IMSECH|Nombres complexes|complexe|Sécante hyperbolique d'un complexe.
IMCSCH|Nombres complexes|complexe|Cosécante hyperbolique d'un complexe.
VERSION|Information||La version du moteur de calcul.
STDEV|Compatibilité|nombre1; [nombre2]; …|Ancienne version de ECARTYPE.STANDARD.
STDEVP|Compatibilité|nombre1; [nombre2]; …|Ancienne version de ECARTYPE.PEARSON.
STDEVS|Compatibilité|nombre1; [nombre2]; …|Autre nom de ECARTYPE.STANDARD.
VAR|Compatibilité|nombre1; [nombre2]; …|Ancienne version de VAR.S.
VARP|Compatibilité|nombre1; [nombre2]; …|Ancienne version de VAR.P.N.
VARS|Compatibilité|nombre1; [nombre2]; …|Autre nom de VAR.S.
PERCENTILE|Compatibilité|tableau; k|Ancienne version de CENTILE.INCLURE.
QUARTILE|Compatibilité|tableau; quart|Ancienne version de QUARTILE.INCLURE.
COVAR|Compatibilité|tableau1; tableau2|Ancienne version de COVARIANCE.PEARSON.
COVARIANCEP|Compatibilité|tableau1; tableau2|Autre nom de COVARIANCE.PEARSON.
COVARIANCES|Compatibilité|tableau1; tableau2|Autre nom de COVARIANCE.STANDARD.
SKEWP|Compatibilité|nombre1; [nombre2]; …|Autre nom de COEFFICIENT.ASYMETRIE.P.
FTEST|Compatibilité|tableau1; tableau2|Ancienne version de F.TEST.
ZTEST|Compatibilité|tableau; x; [sigma]|Ancienne version de Z.TEST.
TTEST|Compatibilité|tableau1; tableau2; uni_bilatéral; type|Ancienne version de T.TEST.
CHITEST|Compatibilité|plage_observée; plage_attendue|Ancienne version de CHISQ.TEST.
NORMDIST|Compatibilité|x; moyenne; écart_type; cumulative|Ancienne version de LOI.NORMALE.N.
NORMINV|Compatibilité|probabilité; moyenne; écart_type|Ancienne version de LOI.NORMALE.INVERSE.N.
NORMSDIST|Compatibilité|z|Ancienne version de LOI.NORMALE.STANDARD.N.
NORMSINV|Compatibilité|probabilité|Ancienne version de LOI.NORMALE.STANDARD.INVERSE.N.
LOGNORMDIST|Compatibilité|x; moyenne; écart_type|Ancienne version de LOI.LOGNORMALE.N.
LOGINV|Compatibilité|probabilité; moyenne; écart_type|Ancienne version de LOI.LOGNORMALE.INVERSE.N.
LOGNORMINV|Compatibilité|probabilité; moyenne; écart_type|Autre nom de LOI.LOGNORMALE.INVERSE.N.
BINOMDIST|Compatibilité|succès; essais; probabilité; cumulative|Ancienne version de LOI.BINOMIALE.N.
CRITBINOM|Compatibilité|essais; probabilité; alpha|Ancienne version de LOI.BINOMIALE.INVERSE.
NEGBINOMDIST|Compatibilité|échecs; succès; probabilité|Ancienne version de LOI.BINOMIALE.NEG.N.
HYPGEOMDIST|Compatibilité|succès_éch; taille_éch; succès_pop; taille_pop|Ancienne version de LOI.HYPERGEOMETRIQUE.N.
POISSON|Compatibilité|x; moyenne; cumulative|Ancienne version de LOI.POISSON.N.
POISSONDIST|Compatibilité|x; moyenne; cumulative|Autre nom de LOI.POISSON.N.
EXPONDIST|Compatibilité|x; lambda; cumulative|Ancienne version de LOI.EXPONENTIELLE.N.
GAMMADIST|Compatibilité|x; alpha; bêta; cumulative|Ancienne version de LOI.GAMMA.N.
GAMMAINV|Compatibilité|probabilité; alpha; bêta|Ancienne version de LOI.GAMMA.INVERSE.N.
BETADIST|Compatibilité|x; alpha; bêta; [A]; [B]|Ancienne version de LOI.BETA.N.
BETAINV|Compatibilité|probabilité; alpha; bêta; [A]; [B]|Ancienne version de BETA.INVERSE.N.
CHIDIST|Compatibilité|x; degrés_liberté|Ancienne version de LOI.KHIDEUX.DROITE.
CHIINV|Compatibilité|probabilité; degrés_liberté|Ancienne version de LOI.KHIDEUX.INVERSE.DROITE.
CHIDISTRT|Compatibilité|x; degrés_liberté|Autre nom de LOI.KHIDEUX.DROITE.
CHIINVRT|Compatibilité|probabilité; degrés_liberté|Autre nom de LOI.KHIDEUX.INVERSE.DROITE.
FDIST|Compatibilité|x; degrés1; degrés2|Ancienne version de LOI.F.DROITE.
FINV|Compatibilité|probabilité; degrés1; degrés2|Ancienne version de INVERSE.LOI.F.DROITE.
FDISTRT|Compatibilité|x; degrés1; degrés2|Autre nom de LOI.F.DROITE.
FINVRT|Compatibilité|probabilité; degrés1; degrés2|Autre nom de INVERSE.LOI.F.DROITE.
TDIST|Compatibilité|x; degrés_liberté; uni_bilatéral|Ancienne version de LOI.STUDENT.DROITE.
TINV|Compatibilité|probabilité; degrés_liberté|Ancienne version de LOI.STUDENT.INVERSE.BILATERALE.
TDISTRT|Compatibilité|x; degrés_liberté|Autre nom de LOI.STUDENT.DROITE.
TDIST2T|Compatibilité|x; degrés_liberté|Autre nom de LOI.STUDENT.BILATERALE.
TINV2T|Compatibilité|probabilité; degrés_liberté|Autre nom de LOI.STUDENT.INVERSE.BILATERALE.
WEIBULL|Compatibilité|x; alpha; bêta; cumulative|Ancienne version de LOI.WEIBULL.N.
WEIBULLDIST|Compatibilité|x; alpha; bêta; cumulative|Autre nom de LOI.WEIBULL.N.
CONFIDENCE|Compatibilité|alpha; écart_type; taille|Ancienne version de INTERVALLE.CONFIANCE.NORMAL.
`;

  // Les noms français que le moteur ne donne pas (ou mal) : ceux d'Excel en français.
  const NOMS_FR = { SWITCH: 'SI.MULTIPLE', FINV: 'INVERSE.LOI.F', FDIST: 'LOI.F', VERSION: 'VERSION' };

  // Les plus utilisées passent en premier dans l'autocomplétion (=S → SOMME avant SOMME.CARRES).
  const COURANTES = ['SUM', 'IF', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'ROUND', 'VLOOKUP', 'XLOOKUP', 'SUMIF', 'COUNTIF',
    'SUMIFS', 'COUNTIFS', 'IFERROR', 'AND', 'OR', 'TODAY', 'NOW', 'DATE', 'CONCATENATE', 'TEXT', 'LEFT', 'RIGHT', 'MID', 'LEN',
    'INDEX', 'MATCH', 'ABS', 'AVERAGEIF', 'SUBTOTAL', 'SUMPRODUCT', 'YEAR', 'MONTH', 'DAY', 'UPPER', 'LOWER', 'TRIM', 'PMT'];

  const RUBRIQUES = ['Maths', 'Statistiques', 'Logique', 'Recherche', 'Tableaux', 'Texte', 'Date et heure', 'Finances', 'Information',
    'Base de données', 'Trigonométrie', 'Lois statistiques', 'Ingénierie', 'Nombres complexes', 'Compatibilité'];

  let liste = null;   // [{ en, fr, rubrique, args, description, rang }]
  let parEn = null;   // nom anglais → fiche
  let parFr = null;   // nom français → fiche

  // Appelé par Formules une fois le moteur prêt (il connaît les noms français des fonctions).
  function preparer(nomsFrDuMoteur, nomsDuMoteur) {
    const connus = new Set(nomsDuMoteur);
    liste = [];
    parEn = new Map();
    parFr = new Map();
    for (const ligne of LIGNES.trim().split('\n')) {
      const [en, rubrique, args, description] = ligne.split('|');
      if (!connus.has(en)) continue; // une fonction que cette version du moteur ne connaît pas
      const fr = NOMS_FR[en] || nomsFrDuMoteur[en] || en;
      const rang = COURANTES.includes(en) ? COURANTES.indexOf(en) : 1000 + (rubrique === 'Compatibilité' ? 500 : 0);
      const fiche = { en, fr, rubrique, args: args ? args.split(/;\s*/) : [], description, rang };
      liste.push(fiche);
      parEn.set(en, fiche);
      parFr.set(fr, fiche);
    }
    // Les fonctions du moteur absentes du catalogue (une nouvelle version) restent utilisables.
    for (const en of nomsDuMoteur) {
      if (parEn.has(en) || en.startsWith('HF.')) continue;
      const fiche = { en, fr: NOMS_FR[en] || nomsFrDuMoteur[en] || en, rubrique: 'Autres', args: [], description: '', rang: 1800 };
      liste.push(fiche);
      parEn.set(en, fiche);
      parFr.set(fiche.fr, fiche);
    }
  }

  const nom = (f, langue) => (langue === 'en' ? f.en : f.fr);
  // « SOMME(nombre1; [nombre2]; …) », ou avec des virgules en anglais.
  const syntaxe = (f, langue) => `${nom(f, langue)}(${f.args.join(langue === 'en' ? ', ' : '; ')})`;

  // Les fonctions dont le nom commence par ce début (ou le contient, après les autres).
  function chercher(debut, langue, max = 12) {
    const d = debut.toUpperCase();
    const commence = [], contient = [];
    for (const f of liste) {
      const n = nom(f, langue);
      if (n.startsWith(d)) commence.push(f);
      else if (d.length >= 2 && n.includes(d)) contient.push(f);
    }
    const tri = (a, b) => a.rang - b.rang || nom(a, langue).localeCompare(nom(b, langue));
    return [...commence.sort(tri), ...contient.sort(tri)].slice(0, max);
  }

  const parNom = (n, langue) => {
    const N = String(n).toUpperCase();
    return (langue === 'en' ? parEn.get(N) : parFr.get(N)) || parEn.get(N) || parFr.get(N) || null;
  };

  return { preparer, chercher, parNom, syntaxe, nom, RUBRIQUES, toutes: () => liste, enVersFr: () => new Map([...parEn].map(([en, f]) => [en, f.fr])) };
})();
