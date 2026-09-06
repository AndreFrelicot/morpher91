# Morpher91 — Glossaire de travail

État : référence FR/EN initiale ; les choix des autres langues seront ajoutés et révisés avec leurs catalogues. Ce tableau distingue le sens de la simple ressemblance des mots.

| Notion | EN | FR retenu | Définition / piège |
| --- | --- | --- | --- |
| Algorithme sans déformation | Crossfade | Fondu | Nom localisé de la méthode ; identifiant `crossfade` inchangé dans les données. |
| Algorithme triangulé | Mesh | Maillage | Nom localisé de la méthode ; triangles de Delaunay, identifiant `mesh` inchangé. |
| Correspondance géométrique | landmark / feature | repère | Point, ligne ou polyligne reliant A et B. « Fonctionnalité » désigne une capacité de l’app. |
| Image temporelle | frame | image | Image d’une séquence vidéo. « Cadre » désigne les limites spatiales. |
| Animation | keyframe | image clé | Valeur définie à un instant ; les valeurs intermédiaires sont interpolées. |
| Composition | layer | calque | Contribution superposée, dotée de repères, d’un masque et de réglages. |
| Organisation temporelle | track | piste | Ligne de la timeline. Pas un synonyme universel de calque. |
| Élément temporel | clip | clip | Portion positionnée et de durée définie ; peut contenir une image fixe. |
| Déformation | warp | déformation | Transformation géométrique. Pas le fondu entre les couleurs des images. |
| Transition d’images | dissolve | fondu | Mélange progressif des images A et B. Ne pas confondre avec le mode « Dissoudre » aléatoire de certains logiciels. |
| Bord de masque | feather | adoucissement | Transition progressive au bord, jamais « plume ». |
| Contrainte | anchor | ancre | Contrainte de bord / point de référence suivant le contexte. |
| Manipulation | handle | poignée | Élément saisissable dans l’éditeur. |
| Première image | Source A | Source A | Côté initial du morph. |
| Seconde image | Target B | Cible B | Côté final du morph, pas destination du fichier exporté. |
| Rendu de travail | preview | aperçu | Affichage interactif ; peut utiliser une résolution réduite. |
| Fusion | Multiply | Produit (Multiply) | Produit des couleurs non prémultipliées, puis composition alpha. |
| Fusion | Screen | Superposition (Screen) | Complément du produit des compléments ; ne pas traduire comme un moniteur. |
| Fusion | Lighter | Addition (Lighter) | Addition des composantes prémultipliées et de l’alpha, plafonnées à 1 ; ne pas assimiler à « éclaircir », maximum par canal. |
| Position temporelle | offset | décalage | Décalage de placement ou de lecture selon le contrôle ; décrire lequel. |
| Intervalle | duration | durée | Longueur de l’intervalle, distincte de sa fin absolue. |
| Modification de portion | trim | ajuster les bords | Changer les limites temporelles d’un clip, pas déplacer le clip entier. |

Les noms anglais des modes entre parenthèses facilitent le rapprochement avec les presets sans remplacer les explications locales. Les noms d’algorithmes restent consacrés : Thin-Plate Spline, TPS, Beier–Neely et Delaunay.

## Références consultées

- [GIMP — Modes de calque](https://docs.gimp.org/3.0/fr/gimp-concepts-layer-modes.html), consulté le 5 septembre 2026. Certaines sections françaises du manuel sont encore en anglais ; ne pas les prendre pour des traductions françaises validées. La distinction entre son mode Dissoudre et le fondu temporel du studio est essentielle.
- [W3C — Direction du texte et structures HTML](https://www.w3.org/International/questions/qa-html-dir), consulté le 5 septembre 2026 : direction du document, propriétés logiques et zones de direction différente.
- [Adobe — Descriptions des modes de fusion](https://helpx.adobe.com/fr/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), consulté le 5 septembre 2026. Retenu « Produit » / « Superposition » ; la nomenclature d’addition est propre à chaque logiciel. Aucun transfert aveugle du nom « Éclaircir » vers `lighter`.
- Code vérifié : `app/src/morph/layers/compositeMath.ts` et `composite.wgsl`. Multiply : `dst * src` ; Screen : `1 - (1-dst)*(1-src)` sur les couleurs non prémultipliées ; Lighter : somme plafonnée des couleurs prémultipliées **et** de l’alpha. La traduction du contrôle FR est corrigée en « Addition » ; EN affiche « Add (Lighter) ».
- `crossfade.wgsl` mélange A et B selon le paramètre de fondu ; il n’exige pas un intervalle de 0–100 % pour produire une image. Correction de l’affirmation contraire dans le guide FR et EN.

## Allemand — choix de la première révision

Registre : allemand standard, vouvoiement « Sie » dans les guides et messages ; infinitifs dans les commandes. Les noms propres Foxy, Bunny, Claire, Anna et Karl2000 sont conservés.

| Notion | DE retenu | Distinction |
| --- | --- | --- |
| feature / landmark | Referenz ; Referenzpunkt pour un point, Korrespondenzpunkt dans le guide de création | Pas « Funktion », réservé à une capacité du logiciel. |
| frame / keyframe | Bild / Keyframe | Un Bild est une image vidéo, pas un cadre ; Keyframe est employé uniformément pour l’animation. |
| layer / track / clip | Ebene / Spur / Clip | Le calque contribue au rendu, la piste organise le temps. |
| warp / dissolve | Verformung / Überblendung | Le second mélange les images ; ne pas employer « Auflösen ». |
| mesh | Dreiecksnetz | « Mesh » reste un mot-clé de recherche technique. |
| feather | Weiche Kante | Aucun rapport avec une plume ; réglage de douceur du bord. |
| opacity | Deckkraft | À distinguer de la force du pinceau, Stärke. |
| anchor / handle | Anker / Griff | Randanker pour les contraintes TPS ; Griff pour un élément manipulable. |
| source / target | Quelle A / Ziel B | La destination d’export est Ausgabe. |
| Multiply / Screen / Lighter | Multiplizieren / Negativ multiplizieren / Addieren | Les formules du moteur arbitrent les noms ; Lighter additionne, ce n’est pas le maximum par canal. |
| offset / duration / trim | Versatz / Dauer / trimmen | Les commandes effectives Start, In et Dauer précisent le repère temporel. |
| easing | Verlauf | Beschleunigen / abbremsen pour les courbes correspondantes. |
| inspector | Eigenschaften | Même libellé dans les interfaces de bureau et compactes. |

Références allemandes consultées le 5 septembre 2026 : [Adobe — Mischmodi](https://www.adobe.com/de/products/photoshop/blend-colors.html), [Adobe — Beschreibungen der Mischmodi](https://helpx.adobe.com/ch_de/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), [GIMP — Ebenenmaske hinzufügen](https://docs.gimp.org/2.10/de/gimp-layer-mask-add.html). La nomenclature Adobe ne transforme pas `lighter` en son opération « Aufhellen ».

## Espagnol — choix révisés

Espagnol standard ; tutoiement dans les consignes, infinitif dans les commandes. « Vídeo » est la graphie choisie pour tout le catalogue. Foxy, Bunny, Claire, Anna et Karl2000 restent des noms propres. « Ejemplos » désigne les projets de démonstration, tandis que « Ajuste preestablecido » désigne un réglage de transition.

| Notion | ES retenu | Distinction |
| --- | --- | --- |
| feature / landmark | referencia ; punto de correspondencia pour le point | « Función » concerne une capacité du logiciel ou le rôle d’une région ; pas le repère géométrique. |
| frame / keyframe / spatial frame | fotograma / fotograma clave / marco | Éviter « cuadro » pour une image temporelle dans ce catalogue. |
| layer / track / clip | capa / pista / clip | Une piste organise le temps ; une capa participe à la composition. |
| warp / dissolve / blend | deformación / fundido / fusión | Ne pas traduire dissolve par le mode aléatoire Disolver. |
| feather | calado | Le guide explicite « suavizar el borde » ; pas « pluma ». |
| anchor / handle | anclaje / tirador | Contraintes TPS contre points saisissables. |
| source / target | Origen A / Destino B | « Fuente » reste disponible pour la police de caractères, évitant une ambiguïté dans le guide de langue. Sortie du fichier : Salida. |
| Screen / Multiply / Lighter | Trama / Multiplicar / Sumar | Screen n’est pas Pantalla ; Sumar additionne les composantes prémultipliées et l’alpha, ce n’est pas Aclarar (maximum). |
| offset / duration / trim | desplazamiento / duración / recortar | Inicio est le placement dans le montage ; entrada est le point d’entrée dans le média. |
| preview / inspector | Vista previa / Propiedades | Même terminologie dans les vues compactes et les guides. |

Références consultées le 6 septembre 2026 : [Adobe — Fotogramas clave](https://helpx.adobe.com/es/after-effects/desktop/animate-in-after-effects/animation-keyframes/setting-selecting-deleting-keyframes.html), [Adobe — Canales alfa y máscaras](https://helpx.adobe.com/mx/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [Adobe — Modos de fusión](https://www.adobe.com/es/products/photoshop/blending-modes.html), [Adobe — Trama et Multiplicar](https://blog.adobe.com/es/publish/2020/05/25/modos-de-fusion-en-adobe-photoshop). Les noms de métier sont recoupés avec `compositeMath.ts` : aucune équivalence aveugle avec une opération Adobe.

## Italien — lexique révisé

| Notion | IT retenu | Distinction |
| --- | --- | --- |
| feature / landmark | riferimento ; punto di corrispondenza | Le repère géométrique est distinct d’une funzionalità. Un lien vers une entité est un collegamento. |
| frame / keyframe / cadre | fotogramma / fotogramma chiave / quadro | L’image fixe reste immagine ; le temps vidéo se lit en secondi:fotogrammi. |
| layer / track / clip | livello / pista / clip | Composition, organisation temporelle, intervalle occupé. |
| warp / dissolve / blend / feather | deformazione / dissolvenza / fusione / sfumatura | Sfumatura concerne le bord d’un masque ; Dissolvenza le passage entre A et B. |
| mesh | reticolo | Conserver mesh comme mot-clé technique. Contrôlé dans le panneau et la comparaison des algorithmes. |
| anchor / handle | ancoraggio / maniglia | Contraintes TPS contre poignées manipulables. |
| source / target | Origine A / Destinazione B | Ce sont les deux médias ; la sortie de fichier est Output/Esportazione. |
| Screen / Multiply / Lighter | Scolora / Moltiplica / Aggiungi | Aggiungi additionne couleurs prémultipliées et alpha ; ne pas employer Schiarisci (maximum). |
| start / in / duration / trim | inizio / attacco / durata / tagliare | Inizio situe la clip dans le montage ; attacco est son entrée dans le fichier original. |
| preview / inspector | Anteprima / Proprietà | Même vocabulaire dans les guides et les panneaux compacts. |

Sources officielles italiennes consultées le 6 septembre 2026 : [Adobe — Fotogrammi chiave](https://helpx.adobe.com/it/after-effects/using/setting-selecting-deleting-keyframes.html), [Adobe — Sfumatura maschera](https://helpx.adobe.com/it/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [Adobe — Modalità di fusione](https://helpx.adobe.com/it/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html). Ces références fixent les termes, sans assimiler aveuglément les opérations du moteur à celles d’Adobe.

Italien : le statut full-frame est **immagine intera**, avec l’explication « sull’intera immagine » dans le guide. Les passes sémantique, rédactionnelle et la recette intermédiaire sont documentées dans la revue éditoriale (it-review.md) ; validation native non effectuée.

## Portugais brésilien — lexique révisé

| Notion | PT-BR retenu | Distinction |
| --- | --- | --- |
| feature / landmark | referência ; ponto de correspondência | Repère géométrique, pas recurso/função du logiciel. |
| frame / keyframe | quadro / quadro-chave | Quadros-chave au pluriel ; image fixe : imagem estática. |
| layer / track / clip | camada / faixa / clipe | Composition, piste temporelle et portion positionnée. |
| warp / dissolve / blend | deformação / fusão / mesclagem | Fusão désigne la transition entre A/B, pas le mode aléatoire Dissolver. |
| feather | difusão | Le guide explicite suavizar a borda ; aucun rapport avec une plume. |
| anchor / handle | âncora / alça | Contrainte TPS contre poignée manipulable. |
| source / target | Origem A / Destino B | Le fichier exporté est Saída ; fonte désigne une police. |
| Screen / Multiply / Lighter | Divisão / Multiplicação / Adição | Divisão est Screen, pas Dividir ; Adição n’est pas Clarear (maximum par canal). |
| start / in / duration / trim | início / entrada / duração / cortar | Entrée dans le fichier original distincte de la position dans le montage. |
| preview / inspector | Prévia / Propriedades | Identiques dans les panneaux compacts et l’aide. |

Sources consultées le 6 septembre 2026 : [Adobe Brasil — Descrições dos modos de mesclagem](https://helpx.adobe.com/br/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), [Adobe Brasil — Canais alfa, máscaras e foscos](https://helpx.adobe.com/br/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html). Les noms sont recoupés avec les formules dans `compositeMath.ts` ; aucune assimilation d’Adição à un maximum.

## Turc — lexique de la traduction contextuelle

| Notion | TR retenu | Distinction |
| --- | --- | --- |
| feature / landmark | işaret ; eşleşme noktası | Repère géométrique, pas işlev/özellik de l’application. |
| frame / keyframe / spatial frame | kare / anahtar kare / çerçeve ou alan | Le terme vidéo kare ne désigne pas systématiquement un cadre spatial. |
| layer / track / clip | katman / iz / klip | Composition, piste temporelle, portion positionnée. |
| warp / dissolve / blend | çarpıtma / görüntü geçişi / karıştırma | Çapraz geçiş nomme l’algorithme sans déformation ; ne pas le confondre avec le mode de bruit Erime. |
| feather / TPS smoothing | kenar yumuşatma / yumuşatma (λ) | Douceur du bord du masque versus régularisation géométrique. |
| anchor / handle | sabitleme noktası / tutamaç | Contrainte de bord TPS versus poignée manipulable. |
| source / target | Kaynak A / Hedef B | Les deux médias ; sortie du fichier : Çıktı. |
| Screen / Multiply / Lighter | Ekran / Çoğalt / Ekle | Noms métier dans le menu Karıştırma ; Ekle est l’addition, pas Açıklaştır (maximum). |
| start / in / duration / trim | başlangıç / giriş / süre / kırpma | Giriş indique le temps d’entrée dans le média source, pas la position du clip. |
| preview / inspector | Önizleme / Özellikler | Mêmes libellés dans le studio et l’aide. |

Sources officielles consultées le 6 septembre 2026 : [Adobe — Renkleri karıştırma](https://helpx.adobe.com/tr/indesign/using/blending-colors.html), [Adobe — Kareler ve anahtar kareler](https://helpx.adobe.com/tr/animate/using/frames-keyframes.html), [Adobe — Katman özelliklerini canlandırma](https://helpx.adobe.com/tr/photoshop/desktop/add-video-and-animation/use-keyframes/overview-of-animating-layer-properties.html), [Adobe — Ara hareket animasyonu](https://helpx.adobe.com/tr/animate/using/motion-tween-animation/motion-tween-animation2.html). Les termes sont adaptés au modèle réel de Morpher91 ; les fonctions d’Adobe ne sont pas transposées au moteur.

Révision turque : corps humain entier → **vücut**, pour éviter la lecture « torse » de gövde ; tracés de contrôle → **yardımcı çizimler**, distincts des guides d’aide (**kılavuz**). Fondu tardif → **Gecikmeli görüntü geçişi**. Les noms de repères anglais restent intacts.

## Indonésien — lexique révisé

| Notion | Choix initial | Distinction |
| --- | --- | --- |
| feature géométrique / capacité du logiciel | penanda / fitur | Ne pas nommer les repères fitur |
| layer / track / clip | lapisan / trek / klip | Trois objets distincts |
| frame / keyframe | bingkai / keyframe | Bingkai kunci accepté comme mot-clé ; kanvas pour la surface de l’exemple transparent |
| warp / dissolve | deformasi / transisi pudar | Forme vs mélange temporel A/B ; pas le Dissolve aléatoire d’un outil de peinture |
| feather / smoothing | pelembutan tepi / penghalusan | Bord du masque vs paramètre TPS λ |
| anchor / handle | penambat / pegangan | Contrainte de bord vs contrôle déplaçable |
| source / target | Sumber A / Tujuan B | Images du morph, distinctes du chemin d’un fichier exporté |
| Multiply / Screen / Lighter | Kalikan / Layar / Tambah | Formules explicitées dans le guide ; Tambah additionne avec saturation |
| offset / duration / trim | décrire le déplacement / durasi / pangkas | Mulai et masuk distinguent position du clip et entrée dans la source |
| cancel / undo | Batal / Urungkan | Confirmation/opération vs historique d’édition |
| overlay / guide d’aide | gambar bantu / panduan | Ne pas confondre les tracés de contrôle et les étapes d’aide |

Révisions séparées du sens et de la rédaction effectuées. Sources et réserves dans la revue éditoriale (id-review.md) : Adobe ID (animation, distorsion), Microsoft ID (vidéo et modes de mélange). Validation native non effectuée.

Indonésien révisé : **polyline** pour une ligne composée de segments, expliquée par **garis bersambung** ; éviter poligaris, moins établi. Pegangan reste la poignée de manipulation. Références : [Google Maps ID — polyline](https://developers.google.com/maps/documentation/directions/get-directions?hl=id), [LibreOffice ID — poignées des formes](https://help.libreoffice.org/latest/id/text/shared/02/symbolshapes.html).

## Russe — lexique de la traduction contextuelle

| Notion | Choix initial | Distinction |
| --- | --- | --- |
| feature géométrique / capacité du logiciel | ориентир / функция ou возможность | Orientir couvre points, lignes et régions ; ne pas traduire par функция |
| frame / keyframe / canvas | кадр / ключевой кадр / холст | Cadre temporel distinct de la surface de dessin |
| layer / track / clip | слой / дорожка / клип | Composition, piste temporelle et portion positionnée |
| warp / dissolve / blend | деформация / смешивание / наложение | Changement de forme, mélange progressif A/B et mode de fusion ; Кроссфейд nomme l’algorithme sans déformation |
| feather / smoothing | растушёвка / сглаживание | Bord du masque versus régularisation TPS λ |
| anchor / handle | опора по краю / маркер | Contrainte TPS au bord versus contrôle manipulable |
| source / target | Исходное A / Целевое B | Les deux médias, pas le chemin d’export |
| Multiply / Screen / Lighter | Умножение / Экран / Сложение | Multiplication, Screen et addition bornée ; pas maximum par canal |
| start / in / duration / trim | начало / вход / длительность / обрезка | Entrée dans le fichier source distincte de la position sur la timeline |
| cancel / undo | Отмена / Отменить действие | Fermeture/annulation d’opération versus historique d’édition |
| overlay / guide | вспомогательные линии / руководство | Tracés de contrôle distincts de l’aide pas à pas |

Sources consultées le 6 septembre 2026 : [Adobe Firefly — modes de fusion](https://helpx.adobe.com/ru/firefly/web/firefly-video-editor/add-and-organize-media/blend-modes.html), [Adobe Photoshop — vidéo et animation](https://helpx.adobe.com/ru/photoshop/using/video-animation-overview.html), [Adobe After Effects — masques et alpha](https://helpx.adobe.com/ru/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html). Usage de vocabulaire professionnel seulement ; les descriptions suivent le modèle de Morpher91. Révisions séparées du sens et de la rédaction effectuées ; validation native non effectuée. Le paramètre Beier–Neely a devient «Сглаживание влияния (a)» : il régularise le poids près de la ligne, sans modifier une distance géométrique. Le libellé accessible des tracés devient «Вспомогательное отображение», distinct du mode de fusion «Наложение».

## Japonais — première traduction contextuelle

| Notion | Choix | Distinction |
| --- | --- | --- |
| feature géométrique / fonctionnalité | 制御要素 / 機能 | Le premier couvre points, lignes et régions ; 制御点 pour les points seulement |
| frame / keyframe / canvas | フレーム / キーフレーム / キャンバス | Temps vidéo, clé d’animation, surface spatiale |
| layer / track / clip | レイヤー / トラック / クリップ | Composition, piste, élément temporel |
| warp / dissolve | 変形 / ディゾルブ | Déformation géométrique versus mélange A/B ; クロスフェード pour le nom d’algorithme |
| feather / smoothing | 境界のぼかし / 平滑化 | Adoucissement du bord de masque versus régularisation |
| anchor / handle / landmark | アンカー / ハンドル / 対応部位 | Contrainte TPS au bord, contrôle manipulable, signification d’une correspondance |
| source / target | ソース A / ターゲット B | Médias de départ/arrivée, distincts de la destination d’export |
| Multiply / Screen / Lighter | 乗算 / スクリーン / 加算 | Les formules de Morpher91 priment ; addition bornée, pas maximum par canal |
| start / in / duration / trim | 開始 / イン点 / 長さ / トリミング | Temps maître versus point d’entrée dans le média |
| cancel / undo / redo | キャンセル / 元に戻す / やり直す | Annulation d’une opération versus historique d’édition |

Sources consultées : [Adobe Photoshop — 描画モード](https://helpx.adobe.com/jp/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), [After Effects — masques et alpha](https://helpx.adobe.com/jp/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [Premiere — keyframes](https://helpx.adobe.com/jp/premiere/desktop/add-video-effects/control-effects-and-transitions-using-keyframes/about-keyframes.html). Les sources servent à établir l’usage des termes, pas à copier les descriptions. Révisions séparées du sens et de la rédaction effectuées (rapport JA). `適用範囲` désigne la couverture colorée du calque ; `状態` ses badges. `寄与` est écarté de ces contrôles car trop abstrait. Validation native non effectuée.

## Coréen — lexique de la traduction contextuelle

| Notion | Choix initial | Distinction |
| --- | --- | --- |
| feature géométrique / capacité | 제어 요소 / 기능 | 제어점 pour un point seul ; 점 est le nom du bouton |
| frame / keyframe / cadre | 프레임 / 키프레임 / 캔버스 | Image temporelle, clé d’animation, surface spatiale |
| layer / track / clip | 레이어 / 트랙 / 클립 | Composition, piste, bloc temporel |
| warp / dissolve | 변형 / 디졸브 | Géométrie versus mélange temporel A/B ; 크로스페이드 pour l’algorithme |
| feather / smoothing | 가장자리 페더 / 평활화 | Adoucissement du bord versus régularisation TPS |
| anchor / handle / landmark | 앵커 / 핸들 / 대응 부위 | Contrainte TPS, manipulation, sens d’une correspondance |
| source / target | 원본 A / 대상 B | Départ/arrivée du morphing, distincts de la destination d’export |
| Multiply / Screen / Lighter | 곱하기 / 스크린 / 더하기 | Formules du code ; Lighter est une somme bornée, pas un maximum |
| start / in / duration / trim | 시작 / 소스 시작점 / 길이 / 트리밍 | Début maître distinct du point d’entrée dans le média |
| cancel / undo / redo | 취소 / 실행 취소 / 다시 실행 | Abandon d’opération distinct de l’historique |
| contribution / badges | 적용 영역 / 상태 | Couverture colorée et état des calques, sans traduction abstraite de contribution |

Sources consultées : [Photoshop — 혼합 모드 설명](https://helpx.adobe.com/kr/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), [After Effects — masques et alpha](https://helpx.adobe.com/kr/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [After Effects — keyframes](https://helpx.adobe.com/kr/after-effects/desktop/animate-in-after-effects/animation-keyframes/setting-selecting-deleting-keyframes.html). Le 디졸브 de Photoshop est un mode aléatoire distinct du fondu temporel de Morpher91 : seule la terminologie est consultée, les descriptions suivent le code. Révisions sémantique et rédactionnelle séparées effectuées ; recette visuelle intermédiaire documentée dans le rapport KO. 프레임 전체 désigne le cadre complet, distinct du mode plein écran ; 열매 le fruit entier. Validation native non effectuée.

## Chinois simplifié — traduction contextuelle initiale

| Notion | Choix initial | Distinction |
| --- | --- | --- |
| feature géométrique / capacité | 控制要素 / 功能 | 控制点 pour le point seul ; 对应部位 pour sa sémantique |
| frame / keyframe / canvas | 帧 / 关键帧 / 画布 | Temps, pose d’animation, surface spatiale |
| layer / track / clip | 图层 / 轨道 / 片段 | Composition, piste temporelle, élément positionné |
| morphing / warp / dissolve | 形态过渡 / 形变 / 溶解 | 交叉淡化 nomme l’algorithme sans déformation |
| feather / smoothing | 羽化 / 平滑度 | Bord de masque versus régularisation TPS |
| anchor / handle | 锚点 / 控制柄 | Contrainte de bord et manipulation |
| source / target | 源 / 目标 | Médias A/B, pas destination d’export |
| Multiply / Screen / Lighter | 正片叠底 / 滤色 / 相加 | Addition bornée ; ne pas utiliser 变亮, qui peut désigner le maximum par canal |
| start / in / duration / trim | 起点 / 源入点 / 时长 / 修剪 | Le temps maître reste distinct du temps du fichier vidéo |
| cancel / undo / redo | 取消 / 撤销 / 重做 | Abandon d’opération versus historique |

Sources consultées : [Photoshop — modes de fusion](https://helpx.adobe.com/cn/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html), [After Effects — masques](https://helpx.adobe.com/cn/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [Adobe Learn — clés](https://www.adobe.com/cn/learn/after-effects/web/create-composition-animation). La définition des opérations suit Morpher91. Le mode 溶解 de Photoshop ne doit pas être confondu avec le fondu temporel. Révisions séparées encore à faire, validation native non effectuée.

### Révision chinoise — masque peint

Utiliser **手绘蒙版** comme nom du masque peint (type, contrôles, noms pédagogiques de calques, diagnostics). **绘制蒙版** désigne l’action de peindre un masque. Harmonisation appliquée au catalogue, à l’inspecteur et aux étapes du guide ; ne pas effectuer de remplacement aveugle de toutes les occurrences verbales.

## Thaï — choix révisés

| Notion | Choix | Distinction |
| --- | --- | --- |
| feature géométrique / capacité | ตัวควบคุมรูปทรง / ฟังก์ชัน | Point, segment, polyligne ou région versus fonction logicielle |
| point / handle / anchor | จุด / จุดจับ / จุดยึด | Type de repère, manipulation et contrainte TPS |
| frame / keyframe / cadre | เฟรม / คีย์เฟรม / กรอบภาพ | Temps, clé d’animation et étendue spatiale |
| layer / track / clip | เลเยอร์ / แทร็ก / คลิป | Composition, piste et bloc temporel |
| morph / warp / dissolve | มอร์ฟ / บิดรูป / เฟด | ครอสเฟด pour l’algorithme sans déformation |
| feather / smoothing | ขอบนุ่ม / ความเรียบ | Bord de masque versus régularisation TPS ; éviter ขน (plume) |
| source / target | ต้นทาง / ปลายทาง | Médias A/B, distincts d’un emplacement d’export |
| Multiply / Screen / Lighter | คูณ (Multiply) / สกรีน (Screen) / บวก | Somme bornée pour Lighter, pas maximum par composante |
| start / in / duration / trim | เริ่มต้น / จุดเข้าในสื่อ / ระยะเวลา / ตัดขอบ | Début maître versus entrée dans le média |
| easing | การเร่งและผ่อน | Progression à l’intérieur des fenêtres temporelles |
| cancel / undo / redo | ยกเลิก / เลิกทำ / ทำซ้ำ | Abandon d’opération versus historique |
| hidden / masked | ซ่อนอยู่ / มีมาสก์ | Invisible versus restriction spatiale |

Sources : [Adobe — modes de fusion](https://www.adobe.com/th_th/products/photoshop/blending-modes.html), [keyframing](https://www.adobe.com/th_th/creativecloud/video/discover/keyframing.html), [Feather](https://helpx.adobe.com/th_th/photoshop/desktop/make-selections/refine-modify-selections/define-feathered-edges.html). Les termes sont consultés, les formules viennent du studio. Révisions séparées du sens et de la rédaction effectuées ; validation native non effectuée. Résultat composite : **ผลลัพธ์สุดท้าย**, distinct de บวก (addition). Masque peint nominal : **มาสก์ที่ระบาย**, y compris les noms pédagogiques de calques. Courbes ease-in / ease-out / ease-in-out : **ค่อย ๆ เร่ง / ค่อย ๆ ผ่อน / เร่งแล้วผ่อน**.

## Hindi — traduction contextuelle initiale

| Notion | Choix | Distinction |
| --- | --- | --- |
| feature géométrique / capacité | नियंत्रण तत्व / सुविधा | Élément géométrique versus fonction logicielle |
| point / segment / polyline / region | बिंदु / रेखाखंड / पॉलीलाइन / क्षेत्र | Quatre types de contrôle |
| frame / keyframe / cadre | फ़्रेम / कीफ़्रेम / चित्र का फ़्रेम | Temps versus étendue spatiale |
| layer / track / clip | लेयर / ट्रैक / क्लिप | Composition, piste et élément temporel |
| morph / warp / dissolve | मॉर्फिंग / आकृति परिवर्तन / फ़ेड | क्रॉसफ़ेड nomme le procédé sans déformation |
| feather / smoothing | किनारे की नरमी / स्मूदनेस | Bord de masque versus régularisation TPS |
| anchor / handle | एंकर / हैंडल | Contrainte et manipulation |
| source / target | स्रोत / लक्ष्य | Images A/B |
| Multiply / Screen / Lighter | मल्टिप्लाई / स्क्रीन / जोड़ | Somme bornée, pas maximum par composante |
| start / in / duration / trim | शुरुआत / मीडिया में प्रवेश / अवधि / ट्रिम | Temps maître et temps source distincts |
| easing | बदलाव की गति | Progression temporelle à l’intérieur d’une fenêtre |
| cancel / undo / redo | रद्द करें / पूर्ववत करें / फिर से करें | Abandon d’opération versus historique |

Sources effectivement consultées : Adobe Hindi [masque inversé](https://www.adobe.com/in_hi/products/photoshop/invert-mask.html), [modes de fusion](https://www.adobe.com/in_hi/products/photoshop/blending-modes.html). Vocabulaire professionnel mêlant hindi courant et emprunts établis. La page Adobe de keyframing à l’URL `in_hi` renvoie un corps anglais : elle ne constitue pas une attestation linguistique hindi. Le PDF Microsoft Hindi StyleGuide n’a pas pu être ouvert ; seul l’extrait de recherche a été disponible. Révisions sémantique et rédactionnelle séparées effectuées ; recette visuelle intermédiaire documentée dans `hi-review.md`, validation native non effectuée.

Hindi — révision : nommer les courbes धीमी शुरुआत / धीमा अंत / धीमी शुरुआत और अंत ; employer पेंट किया गया मास्क au nominatif et conserver les formes fléchies पेंट किए मास्क selon la phrase. La phase muxing est वीडियो फ़ाइल तैयार करना, sans suggérer l’ajout d’un média.

## Bengali — conventions révisées

| Notion | Choix bengali | Distinction |
| --- | --- | --- |
| feature géométrique / capacité | নিয়ন্ত্রণ উপাদান / সুবিধা | Objet qui pilote la géométrie versus fonction du logiciel |
| point / segment / polyline / région | বিন্দু / রেখাংশ / পলিলাইন / অঞ্চল | Types de contrôle distincts |
| frame / keyframe / cadre | ফ্রেম / কিফ্রেম / ছবির ফ্রেম | Image temporelle versus étendue spatiale |
| layer / track / clip | লেয়ার / ট্র্যাক / ক্লিপ | Composition, piste et objet temporel |
| morph / warp / dissolve | মর্ফিং / আকৃতি পরিবর্তন / ফেড | ক্রসফেড est le procédé sans déformation |
| feather / TPS smoothing | প্রান্তের কোমলতা / মসৃণতা | Bord de masque versus régularisation globale |
| anchor / handle | অ্যাঙ্কর / হ্যান্ডল | Contrainte et manipulation |
| source / target | উৎস / লক্ষ্য | Les côtés A/B |
| Multiply / Screen / Lighter | গুণ / স্ক্রিন / যোগ | Produit, éclaircissement complémentaire et somme bornée |
| start / in / duration / trim | শুরু / মিডিয়ায় শুরুর সময় / সময়কাল / ট্রিম | Temps maître versus entrée dans le média source |
| easing | পরিবর্তনের গতি | Progression au sein de la fenêtre |
| undo / redo / cancel | আগের অবস্থায় ফিরুন / আবার করুন / বাতিল করুন | Historique, réapplication et abandon d’opération |
| painted mask | ব্রাশে আঁকা মাস্ক | Masque raster peint au pinceau |

Référence officielle consultée : [catalogue bengali de GIMP](https://github.com/GNOME/gimp/blob/master/po/bn.po), récupéré depuis son URL brute après échec de l’outil web. L’en-tête indique une révision du 4 janvier 2012 ; la source mélange স্তর et লেয়ার, et contient une graphie fautive de l’opacité à côté d’অস্বচ্ছতা. Elle constitue un point de comparaison, pas un modèle intégral ni une autorité sur le naturel actuel. Retenir লেয়ার partout, অস্বচ্ছতা pour l’opacité et স্ক্রিন pour le mode spécialisé ; ne pas employer le littéral পর্দা qui évoque l’écran matériel. Les descriptions de fusion suivent le code de Morpher91. Les règles de pluriels viennent d’Intl, pas de l’ancien en-tête gettext. Révisions sémantique et rédactionnelle séparées effectuées ; validation native non effectuée. Employer আকৃতি pour la forme géométrique, মুছুন pour supprimer une image clé, et খুঁটিনাটি অংশ pour les détails visuels plutôt que বিবরণ (description).

## Arabe — conventions révisées

| Notion | Choix initial | Distinction |
| --- | --- | --- |
| contrôle / fonctionnalité | عنصر تحكم / ميزة | Objet géométrique versus capacité du logiciel |
| point / segment / polyline / région | نقطة / قطعة مستقيمة / خط متعدد المقاطع / منطقة | Ne pas réduire tous les types à « point » |
| frame / keyframe | إطار / إطار أساسي | Image temporelle versus clé d’animation |
| layer / track / clip | طبقة / مسار / مقطع | Composition versus temps |
| morph / warp / dissolve | تحوّل شكلي / تشويه / تلاشي | Morphing, géométrie et mélange temporel |
| feather / TPS smoothing | تنعيم الحواف / التنعيم | Bord du masque versus régularisation globale |
| anchor / handle | نقطة تثبيت / مقبض | Contrainte versus manipulation |
| source / target | المصدر / الهدف | Côtés A/B |
| Multiply / Screen / Lighter | ضرب / شاشة / جمع | Produit, complément et somme bornée |
| start / in / duration | البداية / وقت الدخول في الوسائط / المدة | Temps maître, temps du média et durée |
| easing | منحنى التغيّر | Progression temporelle |
| undo / redo / cancel | تراجع / إعادة / إلغاء | Historique versus abandon d’une opération |

Sources et limites dans la revue éditoriale (ar-review.md) : manuels Adobe arabes de composition et vidéo ; extrait Apple pour تلاشي متقاطع. Le catalogue complet de 791 feuilles est intégré et l’arabe activé. Révisions sémantique et rédactionnelle effectuées séparément ; validation native non effectuée. Employer شبكة الشكل الوسيط pour le maillage interpolé, نقاط متناظرة pour les points correspondants et علامات على شكل مُعيّن pour les marqueurs en losange. Éclaircir se décrit par زيادة السطوع, jamais فتح (ouvrir).
