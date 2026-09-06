#!/usr/bin/env python3
"""Rebuild the teaching catalog. Run from anywhere with Python 3.

Landmarks below are hand-authored in source-image coordinates, then mapped into
Project Space. Existing embedded WebP bytes are reused without recompression.
Video/body reference tracks live in demo-authoring; do not regenerate them from
the retired browser scripts. Visual qualification remains a separate UI pass.
"""
import base64, copy, json, math
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
DEMO = APP / 'public/demo'
OUT = DEMO / 'presets'
SEEDS = APP / 'scripts/demo-authoring'
NOW = '2026-09-05T12:00:00.000Z'
old = [json.loads(p.read_text()) for p in OUT.glob('*.morph.json')]
images = {a['name'].split('.')[0]: a for p in old for a in p['images'].values() if a['source']['kind']=='data-url'}
for name in ['foxy','bunny']:
 image=copy.deepcopy(images['claire'])
 image.update(id='demo-'+name,name=name+'.webp',width=1448,height=1086)
 image['source']={'kind':'data-url','value':'data:image/webp;base64,'+base64.b64encode((SEEDS/'images'/(name+'.webp')).read_bytes()).decode()}
 images[name]=image
manifest = json.loads((DEMO/'manifest.json').read_text())
assets = {a['id']:a for a in manifest['assets']}
locales = {lang:json.loads((APP/f'src/i18n/locales/{lang}.json').read_text()) for lang in ['fr','en']}
for data in locales.values(): data['demo']['presetContent']={}
labels = {}
def label(key,fr,en): labels[key]={'fr':fr,'en':en}; return key
label('global','Global','Global')

def timing(start=0,end=1,easing='smoothstep'):
 return dict(warpStart=0,warpEnd=1,dissolveStart=start,dissolveEnd=end,easing=easing)

def layer(key,fr,en,algo=None,mask=None,mode='normal',opacity=1):
 label(key,fr,en)
 d=dict(id=key,name=fr,enabled=True,visible=True,locked=False,zIndex=1,featureIds=[],opacity=opacity,compositeMode=mode,timing=timing(.3,.7))
 if algo:d['algorithmOverride']=algo
 if mask:d['mask']=dict(featureId=mask,mode='feathered',feather=.025)
 return d

def base(src,tgt,algorithm='thin-plate-spline',size=(1024,768),duration=4):
 p=copy.deepcopy(old[0]); p.update(id='demo',name='',createdAt=NOW,updatedAt=NOW,features=[],activeAlgorithm=algorithm)
 p.pop('videos',None);p.pop('ui',None)
 w,h=size;p['canvas']=dict(aspectRatio='4:3' if w/h==4/3 else '1:1' if w==h else '16:9' if w/h==16/9 else 'custom',width=w,height=h,background='white')
 p['images']={s:copy.deepcopy(images[n]) for s,n in [('source',src),('target',tgt)]}
 p['timeline']=dict(durationSec=duration,fps=30,loop=True,pingPong=False)
 p['algorithmSettings']=dict(crossfade=dict(gammaCorrectBlend=False),mesh=dict(borderAnchors=True,borderAnchorCount=4,showWireframe=False),thinPlateSpline=dict(**{"lambda":.0001},borderAnchors=True,borderAnchorCount=4,samplePolylines=True,polylineSampleSpacing=.055,showGrid=False),beierNeely=dict(a=.003,b=2,p=.5,maxLines=256,samplePolylines=True))
 g=layer('global','Global','Global');g.update(zIndex=0,featureIds='all');p['layers']=[g]
 return p

def feature(key,fr,en,kind='point',**kw):
 label(key,fr,en)
 return dict(id=key,label=en,enabled=True,weight=1,createdAt=NOW,updatedAt=NOW,kind=kind,**kw)

def point(v): return dict(x=round(v[0],6),y=round(v[1],6))
def px(x,y): return (x/1448,y/1086)
# Ordered matching landmarks. Left/right mean screen-left/screen-right.
FACE=[
 ('eyeL','Œil gauche','Left eye',px(633,466),px(675,402)),
 ('eyeR','Œil droit','Right eye',px(820,461),px(857,356)),
 ('eyeLo','Coin externe gauche','Left outer eye',px(582,466),px(622,424)),
 ('eyeLi','Coin interne gauche','Left inner eye',px(682,475),px(718,409)),
 ('eyeRi','Coin interne droit','Right inner eye',px(775,476),px(813,383)),
 ('eyeRo','Coin externe droit','Right outer eye',px(871,466),px(901,357)),
 ('browL','Sourcil gauche','Left brow',px(618,411),px(654,350)),
 ('browR','Sourcil droit','Right brow',px(829,405),px(851,303)),
 ('nose','Pointe du nez','Nose tip',px(738,592),px(792,490)),
 ('noseBridge','Arête du nez','Nose bridge',px(727,481),px(759,397)),
 ('mouthL','Commissure gauche','Left mouth corner',px(632,639),px(704,580)),
 ('mouthR','Commissure droite','Right mouth corner',px(816,638),px(875,550)),
 ('lipTop','Lèvre supérieure','Upper lip',px(725,637),px(790,554)),
 ('lipBottom','Lèvre inférieure','Lower lip',px(730,696),px(802,621)),
 ('chin','Menton','Chin',px(724,797),px(791,715)),
 ('jawL','Mâchoire gauche','Left jaw',px(552,616),px(588,556)),
 ('jawR','Mâchoire droite','Right jaw',px(911,604),px(942,510)),
 ('jawLowL','Bas de joue gauche','Lower left cheek',px(604,741),px(674,676)),
 ('jawLowR','Bas de joue droite','Lower right cheek',px(850,733),px(895,645)),
 ('hairTop','Sommet des cheveux','Hair crown',px(724,43),px(676,44)),
 ('hairL','Cheveux gauche','Left hair',px(456,347),px(384,510)),
 ('hairR','Cheveux droite','Right hair',px(975,337),px(1079,524)),
 ('neckL','Cou gauche','Left neck',px(586,826),px(626,782)),
 ('neckR','Cou droit','Right neck',px(882,825),px(943,777)),
 ('shoulderL','Épaule gauche','Left shoulder',px(271,923),px(252,925)),
 ('shoulderR','Épaule droite','Right shoulder',px(1177,923),px(1190,918)),
]

def points(data,layer_id=None,keys=None):
 out=[]
 for key,fr,en,a,b in data:
  if keys and key not in keys:continue
  f=feature(key,fr,en,a=point(a),b=point(b))
  if layer_id:f['layerId']=layer_id
  out.append(f)
 return out

LINE_PAIRS=[('lineEyeL','Œil gauche — ligne','Left eye — line','eyeLo','eyeLi'),('lineEyeR','Œil droit — ligne','Right eye — line','eyeRi','eyeRo'),('lineNose','Nez — ligne','Nose — line','noseBridge','nose'),('lineMouth','Bouche — ligne','Mouth — line','mouthL','mouthR'),('lineJawL','Mâchoire gauche — ligne','Left jaw — line','jawL','jawLowL'),('lineJawR','Mâchoire droite — ligne','Right jaw — line','jawR','jawLowR'),('lineChin','Menton — ligne','Chin — line','jawLowL','jawLowR'),('lineShoulders','Épaules — ligne','Shoulders — line','shoulderL','shoulderR')]
def lines(data=FACE,layer_id=None):
 coords={r[0]:(r[3],r[4]) for r in data};out=[]
 for key,fr,en,k0,k1 in LINE_PAIRS:
  if k0 not in coords or k1 not in coords:continue
  a,b=coords[k0],coords[k1]
  f=feature(key,fr,en,'segment',a0=point(a[0]),a1=point(b[0]),b0=point(a[1]),b1=point(b[1]))
  if layer_id:f['layerId']=layer_id
  out.append(f)
 for i,(a,b) in enumerate([((.002,.002),(.998,.002)),((.998,.002),(.998,.998)),((.998,.998),(.002,.998)),((.002,.998),(.002,.002))]):
  f=feature('frameLine'+str(i),f'Bord fixe {i+1}',f'Fixed border {i+1}','segment',a0=point(a),a1=point(b),b0=point(a),b1=point(b),locked=True)
  if layer_id:f['layerId']=layer_id
  out.append(f)
 return out

FACE_RING_A=[(.35,.44),(.37,.30),(.46,.22),(.58,.25),(.65,.40),(.63,.61),(.58,.73),(.50,.76),(.42,.72),(.36,.60)]
FACE_RING_B=[(.36,.41),(.38,.24),(.47,.15),(.60,.20),(.66,.34),(.66,.52),(.62,.64),(.55,.69),(.46,.65),(.39,.55)]
def region(key='faceRegion',lid='face',invert=False):
 return feature(key,'Contour du visage','Face outline','region',a=[point(v) for v in FACE_RING_A],b=[point(v) for v in FACE_RING_B],layerId=lid,smooth=True,feather=.025,role='face')

def attach(p,l,features):
 p['layers'].append(l);p['features']+=features;l['featureIds']=[f['id'] for f in features];return p

# Correspondences picked on the original 1448 × 1086 stills, not reused human coordinates.
CARTOON_COORDS={
 'foxy':[(593,538),(850,537),(500,531),(637,551),(803,550),(936,523),(563,370),(872,370),(720,691),(721,634),(555,673),(879,673),(721,745),(721,786),(721,826),(337,650),(1101,653),(494,770),(952,773),(738,171),(342,446),(1098,424),(556,865),(891,865),(352,1009),(1092,1009)],
 'bunny':[(775,483),(933,442),(668,493),(809,524),(901,477),(970,445),(691,365),(886,316),(940,558),(911,504),(798,644),(1000,639),(929,667),(911,740),(879,798),(484,647),(1096,618),(613,763),(1008,743),(754,217),(520,449),(995,391),(669,844),(877,820),(529,1013),(1022,1005)]}
MEDIA_POINTS={name:{row[0]:row[3 if name=='claire' else 4] for row in FACE} for name in ['claire','anna']}
for name,coords in CARTOON_COORDS.items():MEDIA_POINTS[name]={row[0]:px(*xy) for row,xy in zip(FACE,coords)}
MEDIA_RINGS={
 'claire':FACE_RING_A,'anna':FACE_RING_B,
 'foxy':[(.24,.53),(.28,.39),(.39,.28),(.59,.28),(.72,.42),(.75,.59),(.66,.72),(.50,.78),(.35,.73),(.25,.63)],
 'bunny':[(.34,.50),(.40,.37),(.50,.28),(.63,.25),(.70,.35),(.75,.55),(.69,.69),(.61,.77),(.43,.75),(.33,.65)]}
STILL_PAIRS={
 'compare-four-methods':('claire','anna'),
 'crossfade-reference':('foxy','bunny'),
 'faces-points-tps':('claire','bunny'),
 'faces-lines-beier':('claire','anna'),
 'layer-full-frame':('anna','foxy'),
 'layer-region-mask':('anna','foxy'),
 'mask-invert-blend':('bunny','foxy'),
 'blend-light':('foxy','anna'),
 'painted-mask':('foxy','bunny'),
 'combined-masks':('claire','bunny'),
 'contours-push':('bunny','anna'),
 'transition-classic':('foxy','bunny'),
 'layers-timing':('claire','foxy'),
 'transparent-cutout':('foxy','bunny')}

def diversify(p,key):
 if key not in STILL_PAIRS:return
 src,tgt=STILL_PAIRS[key]
 p['images']={side:copy.deepcopy(images[name]) for side,name in [('source',src),('target',tgt)]}
 square=p['canvas']['width']==p['canvas']['height']
 def project_uv(v):return point((v[0],.125+.75*v[1] if square else v[1]))
 def mapped(v,side,name):
  if v is None:return v
  source=(v['x'],(v['y']-.125)/.75 if square else v['y'])
  old_name='claire' if side=='a' else 'anna'
  candidates=MEDIA_POINTS[old_name]
  nearest=min(candidates,key=lambda k:math.dist(source,candidates[k]))
  if math.dist(source,candidates[nearest])>.002:return v
  return project_uv(MEDIA_POINTS[name][nearest])
 for f in p['features']:
  if f['id'].startswith(('frameLine','imageBound')):continue
  for side,name in [('a',src),('b',tgt)]:
   if f['kind']=='region' and f['id']!='paintBoundary':f[side]=[project_uv(v) for v in MEDIA_RINGS[name]]
   elif f['kind']=='segment':
    for n in [0,1]:f[side+str(n)]=mapped(f[side+str(n)],side,name)
   elif isinstance(f.get(side),list):f[side]=[mapped(v,side,name) for v in f[side]]
   elif side in f:f[side]=mapped(f[side],side,name)
 # Match both cartoon ears, including their edges, rather than letting them
 # dissolve independently. Human/cartoon pairs deliberately retain hair topology.
 if {src,tgt}=={'foxy','bunny'} and p['activeAlgorithm']=='mesh' and p['features']:
  p['algorithmSettings']['mesh']['borderAnchorCount']=0
  ears={
   'foxy':[(283,28),(278,277),(491,173),(1145,29),(1160,263),(953,164)],
   'bunny':[(89,123),(272,375),(397,199),(511,19),(700,199),(546,214)]}
  for f in p['features']:
   if f['id']=='hairTop':
    f['a']=project_uv(px(*(715,241) if src=='foxy' else (575,347)))
    f['b']=project_uv(px(*(715,241) if tgt=='foxy' else (575,347)))
  lid=next((f.get('layerId') for f in p['features'] if f['kind']=='point'),None)
  if any(f['kind']=='point' for f in p['features']):
   for i,(a,b) in enumerate(zip(ears[src],ears[tgt])):
    f=feature('ear'+str(i),f'Oreille — repère {i+1}',f'Ear — landmark {i+1}',a=project_uv(px(*a)),b=project_uv(px(*b)))
    if lid:f['layerId']=lid
    p['features'].append(f)
    if lid:next(l for l in p['layers'] if l['id']==lid)['featureIds'].append(f['id'])
 if src=='foxy':
  for l in p['layers']:
   if not l.get('paintedMask'):continue
   w,h=l['paintedMask']['width'],l['paintedMask']['height'];raw=[]
   for y in range(h):
    for x in range(w):
     radius=math.hypot((x/w-.5)/.28,(y/h-.58)/.21);u=max(0,min(1,(1-radius)/.2));raw.append(round(255*u*u*(3-2*u)))
   packed=[];i=0
   while i<len(raw):
    n=1
    while i+n<len(raw) and raw[i+n]==raw[i] and n<255:n+=1
    packed.extend([n,raw[i]]);i+=n
   l['paintedMask']['data']=base64.b64encode(bytes(packed)).decode()

def finish(p,key,fr,en,desc_fr,desc_en,thumb='claire',target='anna',view='triple',time=None,lid=None,fid=None,videos=None):
 diversify(p,key)
 if key in STILL_PAIRS:thumb,target=STILL_PAIRS[key]
 p['id']='demo-'+key;p['name']=fr
 for i,l in enumerate(p['layers']):
  l['zIndex']=i;l.setdefault('clip',dict(startSec=0,durationSec=p['timeline']['durationSec']))
 for f in p['features']:
  f['createdAt']=NOW;f['updatedAt']=NOW
  if f['id'] not in labels:label(f['id'],f.get('label',f['id']),f.get('label',f['id']))
  f['label']=labels[f['id']]['en']
 for l in p['layers']:
  if l['id'] not in labels:label(l['id'],l['name'],l['name'])
 meta=dict(id=key,label=dict(fr=fr,en=en),thumb=f'thumbs/{thumb}.webp',targetThumb=f'thumbs/{target}.webp',file=f'presets/{key}.morph.json',presentation=dict(view=view,timeSec=p['timeline']['durationSec']/2 if time is None else time))
 if lid:meta['presentation']['layerId']=lid
 if fid:meta['presentation']['featureId']=fid
 if videos:meta['videos']={slot:value.replace('_','-') for slot,value in videos.items()}
 catalog.append(meta)
 for lang,data in locales.items():
  # Landmark names stay English in both UI languages; layer names are localized.
  data['demo']['presetContent'][key]={'description':desc_fr if lang=='fr' else desc_en,'labels':{**{f['id']:labels[f['id']]['en'] for f in p['features']},**{l['id']:labels[l['id']][lang] for l in p['layers']}}}
 (OUT/(key+'.morph.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')

catalog=[]
p=base('claire','anna');p['features']=points(FACE)+lines();p['layers'][0]['timing']=timing()
finish(p,'compare-four-methods','Comparer — quatre algorithmes','Compare — four algorithms','La même paire de visages, avec points et lignes. Comparez les yeux et la bouche à mi-parcours.','The same face pair, with points and lines. Compare eyes and mouth halfway through.',view='compare')
p=base('claire','anna','crossfade');p['layers'][0]['timing']=timing()
finish(p,'crossfade-reference','Crossfade — voir le ghosting','Crossfade — see ghosting','Sans repères : observez les doubles contours, puis essayez le comparatif.','No landmarks: observe the double contours, then try the comparison.',view='preview')
p=base('claire','anna');p['features']=points(FACE)
finish(p,'faces-points-tps','Claire → Bunny — points TPS','Claire → Bunny — TPS landmarks','Déplacez un point, affichez la grille TPS et comparez avec les ancres de bord désactivées.','Move a point, show the TPS grid and compare with border anchors disabled.',fid='nose')
p=base('claire','anna','beier-neely');p['features']=lines()
finish(p,'faces-lines-beier','Visages — lignes Beier–Neely','Faces — Beier–Neely lines','Des lignes orientées sur les yeux, le nez et la bouche. Réglez leur influence a, b, p.','Oriented lines on eyes, nose and mouth. Adjust their a, b, p influence.',fid='lineMouth')
# Cars: points authored on each original, mapped to a common 16:9 canvas.
def caruv(x,y,w,h):
 aspect=16/9;scale=min(1,aspect/(w/h));return (x/w,(1-scale)/2+(y/h)*scale)
car_a=[(406,536),(1350,532),(284,535),(530,535),(406,418),(406,650),(1230,532),(1468,532),(1350,414),(1350,650),(91,501),(96,596),(1673,445),(1673,563),(890,252),(1067,256),(579,364),(1219,307),(681,372),(1072,356),(194,445),(1627,385),(839,600)]
car_b=[(369,605),(1284,606),(251,605),(487,605),(369,487),(369,721),(1166,606),(1401,606),(1284,488),(1284,721),(89,536),(90,641),(1568,518),(1566,640),(854,195),(1042,210),(498,359),(1231,335),(603,373),(1015,350),(193,464),(1466,435),(820,662)]
CAR=[]
for i,(a,b) in enumerate(zip(car_a,car_b)):
 names=[('Centre roue avant','Front wheel center'),('Centre roue arrière','Rear wheel center')]
 fr,en=names[i] if i<2 else (f'Carrosserie {i-1:02}',f'Body {i-1:02}')
 CAR.append((f'car{i}',fr,en,caruv(*a,1774,887),caruv(*b,1672,941)))
p=base('red_sport_car','red_city_car','mesh',(1280,720));p['features']=points(CAR)
# Explicit media bounds avoid triangular letterbox edges between different source ratios.
p['algorithmSettings']['mesh']['borderAnchors']=False
for i,(x,y) in enumerate([(0,0),(.5,0),(1,0),(0,1),(.5,1),(1,1)]):
 p['features'].append(feature(f'carBound{i}',f'Limite image {i+1}',f'Image boundary {i+1}',a=point((x,1/18+y*8/9)),b=point((x,y)),locked=True))
finish(p,'cars-mesh','Voitures — maillage','Cars — mesh','Les roues et la silhouette guident les triangles. Activez le maillage pour lire la déformation.','Wheels and silhouette guide the triangles. Show the mesh to read the deformation.',thumb='red_sport_car',target='red_city_car',fid='car0')
# Same face scene for full-frame / region / paint: only coverage changes.
p=base('claire','anna','crossfade');l=layer('face','Visage plein cadre','Full-frame face','thin-plate-spline');attach(p,l,points(FACE,'face'))
finish(p,'layer-full-frame','Calque — plein cadre','Layer — full frame','Masquez le calque supérieur : sans masque, il remplace toute l’image du calque Global.','Hide the top layer: without a mask it replaces the entire Global image.',lid='face')
p=base('claire','anna','crossfade');l=layer('face','Visage en TPS','TPS face','thin-plate-spline','faceRegion');attach(p,l,points(FACE,'face')+[region()])
finish(p,'layer-region-mask','Région — un algo par zone','Region — one algorithm per area','TPS sur le visage, crossfade autour. Inspectez Masque et Contribution ; ajustez le contour et le feather.','TPS on the face, crossfade around it. Inspect Mask and Contribution; adjust the outline and feather.',lid='face',fid='faceRegion')
p=base('claire','anna');p['features']=points(FACE);l=layer('outside','Extérieur en Multiply','Multiply outside','crossfade','faceRegion',mode='multiply',opacity=.4);l['mask']['invert']=True
attach(p,l,[region(lid='outside')])
finish(p,'mask-invert-blend','Masque inversé — Multiply','Inverted mask — Multiply','Le masque protège le visage. Activez et masquez le calque pour voir l’effet du mode Multiply à 40 %.','The mask protects the face. Toggle the layer to see Multiply at 40% opacity.',lid='outside',fid='faceRegion')
p=base('claire','anna');p['features']=points(FACE)
for key,fr,en,mode,opacity,invert in [('light','Visage en Screen','Screen face','screen',.25,False),('glow','Extérieur en Lighter','Lighter outside','lighter',.08,True)]:
 r=region(key+'Region',key);l=layer(key,fr,en,'crossfade',r['id'],mode,opacity);l['mask']['invert']=invert;attach(p,l,[r])
finish(p,'blend-light','Fusion — Screen et Lighter','Blend — Screen and Lighter','Deux apports légers : Screen dans le visage, Lighter autour. Isolez chaque calque et réglez son opacité.','Two subtle contributions: Screen on the face, Lighter around it. Isolate each layer and adjust opacity.',lid='light')
p=base('claire','anna','crossfade');l=layer('paint','Visage peint en TPS','Painted TPS face','thin-plate-spline');attach(p,l,points(FACE,'paint'))
# A soft brush-like mask around the source face in project coordinates. R8 RLE.
w,h=512,384;raw=[]
for y in range(h):
 for x in range(w):
  radius=math.hypot((x/w-.505)/.17,(y/h-.48)/.29);u=max(0,min(1,(1-radius)/.15));raw.append(round(255*u*u*(3-2*u)))
packed=[];i=0
while i<len(raw):
 n=1
 while i+n<len(raw) and raw[i+n]==raw[i] and n<255:n+=1
 packed += [n,raw[i]];i+=n
l['paintedMask']=dict(width=w,height=h,data=base64.b64encode(bytes(packed)).decode())
painted_template=copy.deepcopy(p)
finish(p,'painted-mask','Masque peint — suivre le morph','Painted mask — follow the morph','Le masque peint sur A suit la TPS. Inspectez Masque à 25, 50 et 75 %, puis essayez le pinceau et la gomme.','The mask painted on A follows TPS. Inspect Mask at 25, 50 and 75%, then try the brush and eraser.',lid='paint')
# Union of painted coverage and a hard vector region, with a readable straight extension.
p=copy.deepcopy(painted_template);l=p['layers'][1]
r=feature('paintBoundary','Extension vectorielle','Vector extension','region',a=[point(v) for v in [(.3,.15),(.505,.15),(.505,.85),(.3,.85)]],b=[point(v) for v in [(.3,.1),(.55,.1),(.55,.8),(.3,.8)]],layerId='paint',smooth=False,feather=0)
p['features'].append(r);l['featureIds'].append(r['id']);l['mask']=dict(featureId=r['id'],mode='hard',feather=0)
finish(p,'combined-masks','Masques combinés — région et pinceau','Combined masks — region and brush','La région à bord dur s’ajoute au masque peint (union). Inspectez Masque, puis essayez la gomme hors de la région.','The hard-edged region adds to the painted mask (union). Inspect Mask, then try the eraser outside the region.',lid='paint')
p=base('claire','anna','beier-neely');p['features']=lines()
contour_keys=['jawL','jawLowL','chin','jawLowR','jawR'];coords={r[0]:(r[3],r[4]) for r in FACE}
p['features'] += [feature('jawCurve','Contour à sculpter','Sculpt this outline','polyline',a=[point(coords[k][0]) for k in contour_keys],b=[point(coords[k][1]) for k in contour_keys],closed=False,smooth=True)]
finish(p,'contours-push','Contours — sculpter avec Pousser','Contours — sculpt with Push','Sélectionnez Pousser (K), retouchez la joue, puis annulez. Fermez une copie du contour pour explorer les polygones.','Select Push (K), reshape a cheek, then undo. Close a copy of the contour to explore polygons.',fid='jawCurve')
p=base('claire','anna','mesh');p['features']=points(FACE)
finish(p,'transition-classic','Transition — morph classique','Transition — classic morph','Comparez Standard et Morph classique : warp 0–100 %, fondu 30–70 %. Observez surtout le début et la fin.','Compare Standard and Classic morph: warp 0–100%, dissolve 30–70%. Watch the beginning and end.',view='preview')
p=base('claire','anna','crossfade');p['layers'][0]['timing']=timing(.6,1)
l=layer('face','Visage en avance','Face first','thin-plate-spline','faceRegion');l['timing']=timing(.2,.65,dict(kind='bezier',x1=.3,y1=0,x2=.7,y2=1));l['timing']['dissolveEasing']='ease-in-out';attach(p,l,points(FACE,'face')+[region()])
finish(p,'layers-timing','Timing — visage puis extérieur','Timing — face then surroundings','Le visage fond avant les cheveux. Deux fenêtres et une Bézier ; gardez les calques visibles jusqu’à la fin.','The face dissolves before the hair. Separate windows and a Bézier; layers remain visible to the end.',lid='face',time=2.5)
# The fruit contour was drawn by hand in the studio; keep its pairing and add a modest keyed detour.
seed=json.loads((SEEDS/'fruits-banana-pineapple.json').read_text());p=base('banana','pineapple','thin-plate-spline',(1024,1024))
f=copy.deepcopy(seed['features'][0]);f.update(id='fruitContour',label='Contour animé',layerId='fruit');label('fruitContour','Contour animé','Animated outline');f['smooth']=True
# Small shared translation at the middle preserves the authored shape and endpoint pairing.
f['tracks']={side:[dict(timeSec=t,points=[dict(x=round(v['x']+dx,6),y=round(v['y']+dy,6)) for v in f[side]]) for t,dx,dy in [(0,0,0),(2,-.035,-.025),(4,0,0)]] for side in ['a','b']}
l=layer('fruit','Contour TPS animé','Animated TPS outline','thin-plate-spline');attach(p,l,[f]);p['timeline']['pingPong']=True
finish(p,'fruits-banana-pineapple','Fruits — images clés et aller-retour','Fruit — keyframes and ping-pong','Une polyligne fermée, animée sur images fixes. Déplacez les losanges puis lancez l’aller-retour.','A closed outline animated on still images. Move the diamonds, then play ping-pong.',thumb='banana',target='pineapple',lid='fruit',fid='fruitContour')
# Fruit -> animal: align the crown with the ears and the fruit body with the head.
p=base('pineapple','foxy','mesh',(1024,1024))
fruit_outline=[(.313168,.768962),(.302999,.685779),(.321343,.579407),(.333978,.496971),(.351575,.434537),(.282832,.080992),(.504913,.026872),(.710737,.090836),(.631428,.433821),(.684231,.573319),(.688808,.737451),(.650934,.884909),(.452348,.926308),(.345315,.874165)]
fox_outline=[(400,732),(310,644),(310,581),(382,500),(350,440),(281,28),(738,171),(1145,29),(1061,445),(1097,527),(1140,633),(988,736),(722,834),(509,771)]
f=feature('crownContour','Couronne et silhouette','Crown and silhouette','polyline',a=[point(v) for v in fruit_outline],b=[point((x/1448,.125+.75*y/1086)) for x,y in fox_outline],closed=True,smooth=True)
p['features']=[f];p['algorithmSettings']['mesh']['borderAnchors']=False
for i,(a,b) in enumerate(zip(f['a'],f['b'])):
 p['features'].append(feature('silhouette'+str(i),f'Silhouette {i+1}',f'Silhouette {i+1}',a=copy.deepcopy(a),b=copy.deepcopy(b)))
for i,(x,y) in enumerate([(0,0),(.25,0),(.5,0),(.75,0),(1,0),(0,.5),(1,.5),(0,1),(.25,1),(.5,1),(.75,1),(1,1)]):
 p['features'].append(feature('fruitBound'+str(i),f'Limite image {i+1}',f'Image boundary {i+1}',a=point((x,y)),b=point((x,.125+.75*y)),locked=True))
finish(p,'fruit-to-fox','Ananas → Foxy — métamorphose','Pineapple → Foxy — metamorphosis','La couronne devient les oreilles, le fruit devient le visage. Une correspondance de silhouettes, sans repères de visage humain.','The crown becomes ears and the fruit becomes a face. Paired silhouettes, without human facial landmarks.',thumb='pineapple',target='foxy',fid='crownContour')
# Transparent letterboxing: the media stay opaque, the square canvas exposes alpha above/below.
p=base('claire','anna','mesh',(1024,1024));p['algorithmSettings']['mesh']['borderAnchors']=False;p['canvas']['background']='transparent';p['features']=points(FACE)
for f in p['features']:
 for side in ['a','b']:f[side]['y']=round(.125+.75*f[side]['y'],6)
for i,(x,y) in enumerate([(0,.125),(.5,.125),(1,.125),(0,.875),(.5,.875),(1,.875)]):
 p['features'].append(feature(f'imageBound{i}',f'Limite image {i+1}',f'Image boundary {i+1}',a=point((x,y)),b=point((x,y)),locked=True))
finish(p,'transparent-cutout','Export — cadre transparent','Export — transparent canvas','Images 4:3 dans un cadre carré : les marges sont transparentes. Exportez en PNG avec le fond Transparent ; la vidéo aplatit le fond.','4:3 images in a square canvas: the margins are transparent. Export PNG frames with Transparent background; video flattens the background.',view='preview')
# Video presets are rebuilt below from normalized source-coordinate tracks.
def video_seed(key,body=False):
 p=json.loads((SEEDS/(key+'.json')).read_text());p['createdAt']=NOW;p['updatedAt']=NOW;p.pop('ui',None)
 p['canvas']=dict(aspectRatio='custom' if body else '4:3',width=576 if body else 1024,height=1008 if body else 768,background='white')
 p['algorithmSettings']=copy.deepcopy(base('claire','anna')['algorithmSettings'])
 p['features']=[]
 p['timeline']['fps']=24
 for v in p.get('videos',{}).values():v.pop('fingerprint',None);v['fps']=24
 return p
# Dense tracks were measured on each decoded source frame. Key times are media
# times (inSec + masterTime - startSec), so trimming never shifts the tracks.
TRACKS={name:json.loads((SEEDS/'tracking'/(name+'.json')).read_text()) for name in ['claire','anna','claire-still','cop','karl']}
TRACK_NAMES={row[0]:(row[1],row[2]) for row in FACE}
TRACK_NAMES.update({
 'wristL':('Poignet gauche','Left wrist'),'wristR':('Poignet droit','Right wrist'),
 'elbowL':('Coude gauche','Left elbow'),'elbowR':('Coude droit','Right elbow'),
 'hipL':('Hanche gauche','Left hip'),'hipR':('Hanche droite','Right hip'),
 'kneeL':('Genou gauche','Left knee'),'kneeR':('Genou droit','Right knee'),
 'ankleL':('Cheville gauche','Left ankle'),'ankleR':('Cheville droite','Right ankle')})
def track_name(key):
 if key in TRACK_NAMES:return TRACK_NAMES[key]
 for prefix,fr,en in [('jaw','Mâchoire','Jaw'),('leftEye','Œil gauche','Left eye'),('rightEye','Œil droit','Right eye'),('leftBrow','Sourcil gauche','Left brow'),('rightBrow','Sourcil droit','Right brow'),('nose','Nez','Nose'),('lip','Lèvre','Lip')]:
  if key.startswith(prefix):return fr+' '+key[len(prefix):],en+' '+key[len(prefix):]
 raise ValueError(key)
def tracked_points(src,tgt,prefix=''):
 out=[]
 for key in TRACKS[src][0]['points']:
  fr,en=track_name(key);f=feature(prefix+key,fr,en,tracks={})
  for side,person in [('a',src),('b',tgt)]:
   frames=TRACKS[person];f[side]=point(frames[0]['points'][key])
   if len(frames)>1:f['tracks'][side]=[dict(timeSec=v['timeSec'],pos=point(v['points'][key])) for v in frames]
  out.append(f)
 return out

def tracked_faces():
 p=video_seed('video-faces-keyframes');p['features']=tracked_points('claire','anna')
 p['layers']=[layer('global','Global','Global')];p['layers'][0]['featureIds']='all'
 p['activeAlgorithm']='thin-plate-spline';p['algorithmSettings']['thinPlateSpline']['lambda']=.00001
 p['timeline']['durationSec']=4
 p['videos']['source']['timeline']=dict(startSec=0,inSec=0,durationSec=4)
 # Similar mouth-opening phases make the halfway transition less abrupt.
 p['videos']['target']['timeline']=dict(startSec=0,inSec=2.75,durationSec=4)
 return p
p=tracked_faces()
finish(p,'video-faces-keyframes','Vidéo — repères et images clés','Video — landmarks and keyframes','44 repères suivis à chaque image : yeux, nez, lèvres et mâchoire. Le clip B est décalé dans sa source pour rapprocher les expressions.','44 landmarks tracked on every frame: eyes, nose, lips and jaw. Clip B is trimmed to bring the expressions closer.',thumb='claire_singing',target='anna_singing',fid='chin',videos=dict(source='claire_singing',target='anna_singing'))
# Animated region and segment use the same measured face tracks.
p=tracked_faces();p['layers'][0]['algorithmOverride']='crossfade'
l=layer('videoFace','Visage animé en TPS','Animated TPS face','thin-plate-spline','videoRegion')
for f in p['features']:f['layerId']='videoFace'
r=feature('videoRegion','Région animée','Animated region','region',layerId='videoFace',smooth=True,feather=.025,tracks={})
for side,person in [('a','claire'),('b','anna')]:
 frames=[dict(timeSec=v['timeSec'],points=[point(x) for x in v['region']]) for v in TRACKS[person]]
 r[side]=frames[0]['points'];r['tracks'][side]=frames
mouth=feature('videoMouth','Ligne de bouche animée','Animated mouth line','segment',layerId='videoFace',tracks={})
for side,person in [('a','claire'),('b','anna')]:
 for n,key in enumerate(['mouthL','mouthR']):
  frames=[dict(timeSec=v['timeSec'],pos=point(v['points'][key])) for v in TRACKS[person]]
  mouth[side+str(n)]=frames[0]['pos'];mouth['tracks'][side+str(n)]=frames
p['features'] += [r,mouth];l['featureIds']=[f['id'] for f in p['features']];p['layers'].append(l)
finish(p,'video-region-keyframes','Vidéo — masque et ligne animés','Video — animated mask and line','Le contour et la ligne de bouche suivent chaque image. Inspectez le masque puis sélectionnez la ligne et ses images clés.','The outline and mouth line follow every frame. Inspect the mask, then select the line and its keyframes.',thumb='claire_singing',target='anna_singing',lid='videoFace',videos=dict(source='claire_singing',target='anna_singing'))
p=video_seed('video-photo-alive');p['images']['source']=copy.deepcopy(images['claire']);p['features']=tracked_points('claire-still','claire')
p['activeAlgorithm']='thin-plate-spline';p['algorithmSettings']['thinPlateSpline']['lambda']=.00001
p['layers']=[layer('global','Global','Global')];p['layers'][0]['featureIds']='all';p['layers'][0]['timing']=dict(warpStart=0,warpEnd=.25,dissolveStart=.05,dissolveEnd=.2,easing='smoothstep')
p['timeline']['durationSec']=4;p['videos']['target']['timeline']=dict(startSec=0,inSec=0,durationSec=4)
finish(p,'video-photo-alive','Photo → vidéo — prendre vie','Photo → video — come alive','La photo devient la vidéo du même visage en une seconde. Seul le côté B porte des images clés ; les repères A restent fixes.','The photo becomes a video of the same face in one second. Only side B has keyframes; A landmarks stay fixed.',thumb='claire',target='claire_singing',time=.5,fid='nose',videos=dict(target='claire_singing'))
# Offset clips: morph only during overlap, preserving the media-time tracks.
p=tracked_faces();p['timeline']['durationSec']=4.5
p['videos']['source']['timeline']=dict(startSec=0,inSec=1,durationSec=3)
p['videos']['target']['timeline']=dict(startSec=1.5,inSec=2.75,durationSec=3)
p['layers'][0]['timing']=dict(warpStart=1.5/4.5,warpEnd=3/4.5,dissolveStart=1.95/4.5,dissolveEnd=2.55/4.5,easing='smoothstep')
finish(p,'video-clips-timing','Clips — trim et chevauchement','Clips — trim and overlap','A : 0–3 s, B : 1,5–4,5 s. Les repères suivent le temps des médias malgré les coupes ; le morph occupe leur chevauchement.','A: 0–3 s, B: 1.5–4.5 s. Landmarks follow media time through trims; the morph spans their overlap.',thumb='claire_singing',target='anna_singing',time=2.25,videos=dict(source='claire_singing',target='anna_singing'))
p=video_seed('video-body-walk',True);p['features']=tracked_points('cop','karl','body-');p['activeAlgorithm']='thin-plate-spline';p['timeline']['durationSec']=5
p['videos']['source']['timeline']=dict(startSec=0,inSec=0,durationSec=4)
p['videos']['target']['timeline']=dict(startSec=2,inSec=.5,durationSec=3)
g=layer('global','Global','Global','crossfade');g['featureIds']='all';g['timing']=dict(warpStart=.4,warpEnd=.8,dissolveStart=.4,dissolveEnd=.8,easing='smoothstep')
l=layer('body','Morph pendant le chevauchement','Morph during overlap','thin-plate-spline');l['clip']=dict(startSec=2,durationSec=2)
for f in p['features']:f['layerId']='body'
l['featureIds']=[f['id'] for f in p['features']];p['layers']=[g,l]
finish(p,'video-body-walk','Marche — morph de corps entier','Walking — full-body morph','16 repères par image. Pose détectée sur le policier ; repères manuels et suivi optique sur le robot. Le calque agit pendant le chevauchement.','16 landmarks per frame. Detected pose on the officer; manual anchors and optical flow on the robot. The layer acts during the overlap.',thumb='cop_body_walk',target='karl2000_body_walk',time=3,lid='body',fid='body-chin',videos=dict(source='cop_body_walk',target='karl2000_body_walk'))
manifest['presets']=catalog
(DEMO/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for lang,data in locales.items():
 (APP/f'src/i18n/locales/{lang}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f'Rebuilt {len(catalog)} presets and both locale catalogs. Visual qualification required.')
