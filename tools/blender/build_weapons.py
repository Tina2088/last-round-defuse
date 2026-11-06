"""Original procedural FPS assets. Blender 5.0: blender -b -P tools/blender/build_weapons.py
All dimensions in metres; authoring helpers use Three.js axes (Y up, -Z forward).
No downloaded geometry, textures or trademarks. Deterministic embedded diffuse maps.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
QA = ROOT / 'docs/qa'
OUT.mkdir(parents=True, exist_ok=True); QA.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def xyz(p): return (p[0], -p[2], p[1])
def material(name, color, metallic=0, rough=.5, texture=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    if texture:
        size=512 if texture=='wood' else 256
        y,x=np.mgrid[0:size,0:size]; rng=np.random.default_rng(112)
        noise=rng.random((size,size))
        if texture=='wood':
            grain=np.sin(y*.49+np.sin(x*.018)*5+np.sin(y*.035+x*.02)*2)
            v=.73+.08*grain+.035*noise+.035*np.sin(y*1.7)
        elif texture=='cloth': v=.8+.1*((x%4<2)^(y%4<2))+.1*noise
        else: v=.82+.15*noise+.03*np.sin(x*2)
        rgba=np.ones((size,size,4),dtype=np.float32)
        for c in range(3): rgba[:,:,c]=np.clip(color[c]*v,0,1)
        im=bpy.data.images.new(name+'_diffuse',width=size,height=size); im.pixels.foreach_set(rgba.ravel()); im.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
        m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    return m
steel=material('Parkerized steel',(.16,.19,.21),.78,.36,'metal')
edge=material('Machined edges',(.31,.34,.36),.8,.3)
dark=material('Graphite polymer',(.055,.064,.07),.2,.58,'metal')
wood=material('Oiled walnut',(.49,.205,.072),0,.4,'wood')
cloth=material('Slate woven sleeves',(.18,.23,.24),0,.9,'cloth')
glove=material('Charcoal gloves',(.075,.09,.095),0,.82,'cloth')
pad=material('Leather reinforcement',(.13,.15,.15),0,.64)
olive=material('Olive charge casing',(.29,.32,.18),.1,.67,'cloth')
red=material('Red insulated wire',(.55,.055,.035),.1,.42)
gold=material('Ochre insulated wire',(.7,.41,.06),.2,.4)
screen=material('Display phosphor',(.17,.8,.52),.1,.3)
sp=screen.node_tree.nodes.get('Principled BSDF'); sp.inputs['Emission Color'].default_value=(.1,.65,.3,1); sp.inputs['Emission Strength'].default_value=.7
parts=[]; section='body'
def finish(o,name,mat,bevel=0):
    o.name=name; o.data.materials.append(mat); o['section']=section; parts.append(o)
    if bevel:
        mod=o.modifiers.new('Small manufactured edge','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons: p.use_smooth=False
    return o
def box(name,p,d,mat,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p)); o=bpy.context.object
    o.dimensions=(d[0],d[2],d[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel)
def rod(name,a,b,r,mat,n=12,r2=None):
    aa=Vector(xyz(a)); bb=Vector(xyz(b)); delta=bb-aa
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=delta.length,location=(aa+bb)/2)
    o=bpy.context.object; o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    finish(o,name,mat)
    for poly in o.data.polygons: poly.use_smooth=len(poly.vertices)==4
    return o
def ellipsoid(name,p,d,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=xyz(p)); o=bpy.context.object
    o.scale=(d[0],d[2],d[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat)
    for poly in o.data.polygons: poly.use_smooth=True
    return o
def profile(name,points,width,mat):
    vs=[xyz((x,y,z)) for x in [-width/2,width/2] for z,y in points]; n=len(points)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,name,mat,.003)
def hands(pistol=False):
    global section
    for side in ['right','left']:
        section=side+'Hand'
        if side=='right': wrist=(.065,-.205,.06); palm=(.048,-.145,-.08); elbow=(.23,-.34,.34)
        elif pistol: wrist=(-.075,-.205,.07); palm=(-.045,-.15,-.06); elbow=(-.27,-.35,.34)
        else: wrist=(-.12,-.18,-.43); palm=(-.045,-.095,-.54); elbow=(-.36,-.34,.14)
        rod('Sleeve',elbow,wrist,.069,cloth,12,.048)
        ellipsoid('Cuff',wrist,(.058,.052,.065),dark)
        rod('Glove wrist',wrist,palm,.041,glove,12,.045)
        ellipsoid('Palm',palm,(.054,.066,.075),glove)
        for k in range(4):
            z=palm[2]-.052+k*.031
            x=.0 if side=='left' else .005
            rod('Finger proximal',(x-.04,palm[1]-.015,z),(x+.03,palm[1]-.038,z),.014,glove,8)
            rod('Finger tip',(x+.03,palm[1]-.038,z),(x+.045,palm[1]+.004,z),.013,pad,8)
            box('Knuckle',(palm[0],palm[1]+.049,z),(.047,.015,.022),pad,.004)
        rod('Thumb',(palm[0]-.037,palm[1]+.026,palm[2]+.02),(palm[0]+.015,palm[1]+.015,palm[2]-.047),.021,glove,10)
    section='body'
def rifle():
    global section
    box('Stamped receiver',(0,0,-.225),(.084,.105,.34),steel)
    box('Rounded dust cover',(0,.06,-.23),(.075,.028,.31),dark,.008)
    for z in [-.1,-.16,-.33]:
        for x in [-.044,.044]: rod('Receiver rivet',(x,0,z),(x*1.07,0,z),.007,edge,8)
    box('Ejection port',(.044,.026,-.18),(.004,.034,.095),dark,0)
    rod('Charging handle',(.035,.025,-.23),(.092,.025,-.23),.009,edge)
    box('Selector lever',(.047,-.017,-.18),(.009,.014,.13),edge)
    profile('Walnut buttstock',[(.30,-.09),(.30,.05),(.06,.025),(-.055,.035),(-.055,-.04),(.09,-.055)],.073,wood)
    box('Rubber buttplate',(0,-.02,.30),(.08,.145,.016),dark)
    profile('Pistol grip',[(-.05,-.04),(-.12,-.045),(-.055,-.22),(.016,-.205)],.055,wood)
    box('Trigger guard lower',(0,-.115,-.18),(.018,.012,.1),steel)
    rod('Trigger guard front',(0,-.05,-.23),(0,-.115,-.23),.008,steel,8)
    rod('Trigger',(0,-.05,-.17),(0,-.095,-.18),.009,edge,8)
    profile('Lower walnut handguard',[(-.40,.012),(-.67,.012),(-.65,-.075),(-.41,-.075)],.082,wood)
    box('Upper walnut handguard',(0,.044,-.51),(.064,.045,.19),wood,.008)
    rod('Barrel',(0,.015,-.61),(0,.015,-1.00),.019,steel,16)
    rod('Gas tube',(0,.067,-.40),(0,.067,-.76),.015,steel,12)
    for z in [-.405,-.645]: box('Handguard retainer',(0,-.015,z),(.089,.103,.016),steel)
    for z in [-.45,-.49,-.53,-.57]:
        for x in [-.042,.042]: box('Vent inset',(x,.015,z),(.003,.017,.022),dark,0)
    box('Gas block',(0,.04,-.755),(.045,.078,.034),steel)
    box('Front sight base',(0,.057,-.91),(.044,.103,.029),steel)
    for x in [-.025,.025]: box('Front sight ears',(x,.119,-.91),(.012,.058,.025),steel)
    box('Front sight post',(0,.116,-.91),(.006,.04,.01),edge,0)
    box('Rear sight ramp',(0,.085,-.37),(.055,.035,.085),steel)
    for x in [-.019,.019]: box('Rear sight notch',(x,.109,-.33),(.018,.025,.018),edge,.001)
    rod('Muzzle brake',(0,.015,-.99),(0,.015,-1.055),.024,edge,16)
    rod('Dark bore',(0,.015,-1.055),(0,.015,-1.057),.015,dark,16)
    for x in [-.024,.024]: box('Brake vent',(x,.015,-1.025),(.003,.019,.023),dark,0)
    section='magazine'
    # Swept curved magazine silhouette and raised stamped ribs.
    profile('Curved magazine',[(-.25,-.045),(-.355,-.045),(-.36,-.15),(-.395,-.27),(-.455,-.36),(-.345,-.40),(-.285,-.29),(-.25,-.16)],.064,dark)
    for x in [-.034,.034]:
        for offset in [0,.029,.058]:
            pts=[(x,-.08,-.275-offset),(x,-.17,-.281-offset),(x,-.27,-.315-offset),(x,-.36,-.369-offset)]
            for a,b in zip(pts,pts[1:]): rod('Magazine rib',a,b,.004,steel,6)
    box('Magazine floorplate',(0,-.38,-.398),(.074,.015,.122),steel)
    section='body'; hands()
def pistol():
    global section
    box('Slide',(0,.03,-.22),(.068,.075,.245),steel,.007)
    box('Frame',(0,-.025,-.18),(.071,.043,.22),dark)
    profile('Grip',[(-.11,-.03),(-.18,-.03),(-.12,-.20),(-.035,-.19)],.062,dark)
    box('Grip inset',(0,-.13,-.09),(.068,.088,.05),pad)
    box('Trigger guard',(0,-.09,-.21),(.045,.013,.078),dark)
    box('Trigger guard front',(0,-.06,-.248),(.045,.063,.012),dark)
    rod('Trigger',(0,-.035,-.20),(0,-.071,-.21),.007,edge,8)
    for z in [-.12,-.135,-.15,-.165]:
        for x in [-.035,.035]: box('Slide serration',(x,.025,z),(.005,.05,.005),edge,0)
    box('Ejection port',(.035,.049,-.235),(.003,.027,.047),dark,0)
    rod('Barrel crown',(0,.03,-.34),(0,.03,-.354),.02,edge,16)
    rod('Bore',(0,.03,-.355),(0,.03,-.356),.012,dark,12)
    for x in [-.02,.02]: box('Rear sight',(x,.078,-.12),(.012,.02,.018),dark)
    box('Front sight',(0,.078,-.32),(.009,.018,.017),dark)
    section='magazine'; box('Magazine base',(0,-.20,-.084),(.071,.019,.075),dark)
    section='body'; hands(True)
def c4():
    box('Charge housing',(0,0,-.20),(.28,.085,.34),olive,.012)
    for x in [-.105,.105]: box('Webbing straps',(x,.002,-.20),(.027,.096,.35),dark)
    box('Electronics enclosure',(0,.055,-.20),(.177,.035,.27),steel)
    box('LCD bezel',(0,.078,-.274),(.137,.013,.064),dark)
    box('LCD panel',(0,.086,-.274),(.117,.004,.046),screen,.001)
    # Seven segment display is geometry, with no external font asset.
    for x in [-.041,-.014,.014,.041]:
        for z in [-.287,-.273,-.259]: box('Display segment',(x,.089,z),(.016,.001,.002),dark,0)
        for dx in [-.008,.008]:
            for z in [-.28,-.266]: box('Display segment',(x+dx,.089,z),(.002,.001,.012),dark,0)
    for x in [-.046,0,.046]:
        for z in [-.225,-.193,-.161,-.129]:
            box('Keypad key',(x,.082,z),(.032,.013,.024),pad)
            box('Key legend',(x,.09,z),(.008,.001,.005),edge,0)
    for x in [-.073,.073]:
        for z in [-.32,-.08]: rod('Screw',(x,.076,z),(x,.081,z),.005,edge,8)
    for k,mat in enumerate([red,gold]):
        pts=[(.073,.075,-.30),(.12+k*.014,.065,-.34),(.148+k*.014,.01,-.27),(.14+k*.014,.02,-.10),(.075,.06,-.09)]
        for a,b in zip(pts,pts[1:]): rod('Insulated cable',a,b,.004,mat,8)
def export(name,build):
    global parts,section
    bpy.ops.object.select_all(action='DESELECT'); parts=[]; section='body'; build()
    # Box-projected UVs via smart unwrap; then batch by animation section+material.
    for o in parts:
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
    merged=[]; batches={}
    for o in parts: batches.setdefault((o['section'],o.data.materials[0].name),[]).append(o)
    for (sec,matname),subset in sorted(batches.items()):
        for o in subset: o.select_set(True)
        bpy.context.view_layer.objects.active=subset[0]; bpy.ops.object.join(); o=bpy.context.object
        o.name=sec+'_'+matname; o.select_set(False); merged.append(o)
    # Shared parent pivots have a neutral zero origin, suitable for deterministic animation.
    meshes=merged[:]
    for sec in sorted(set(o['section'] for o in meshes)):
        group=bpy.data.objects.new(sec,None); bpy.context.collection.objects.link(group)
        for o in meshes:
            if o['section']==sec: o.parent=group
        merged.append(group)
    for o in merged: o.select_set(True)
    triangles=0
    for o in merged:
        if o.type=='MESH': o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
    if name=='rifle_fp': assert triangles<=8000,triangles
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_image_format='JPEG',export_jpeg_quality=85,use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
    return merged,triangles
stats={}
for name,build in [('rifle_fp',rifle),('pistol',pistol),('c4',c4)]:
    objs,tris=export(name,build)
    stats[name]={'triangles':tris,'bytes':(OUT/(name+'.glb')).stat().st_size,'maxTexture':512,'source':'Original procedural geometry and seeded NumPy diffuse textures'}
    for o in objs: o.hide_render=True; o.select_set(False)
    # Render each asset in a consistent studio setup, rifle includes both arms.
    for o in objs: o.hide_render=False
    target=Vector(xyz((0,-.06,-.35 if name=='rifle_fp' else -.12)))
    bpy.ops.object.camera_add(location=xyz((1.2,.7,-1.15 if name=='rifle_fp' else -.85))); cam=bpy.context.object
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=1.55 if name=='rifle_fp' else 1.0
    scene=bpy.context.scene; scene.camera=cam
    lights=[]
    for pos,power,size in [((1,2,-1),180,3),((-1,.4,-.5),100,2),((0,.8,1),180,2)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(pos)); light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler(); lights.append(light)
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.world.color=(.13,.16,.2); scene.render.resolution_x=1200; scene.render.resolution_y=800; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(QA/('preview-'+('rifle' if name=='rifle_fp' else name)+'.png'))
    bpy.ops.render.render(write_still=True)
    for o in [cam,*lights]: bpy.data.objects.remove(o,do_unlink=True)
    for o in objs: bpy.data.objects.remove(o,do_unlink=True)
(QA/'model-stats.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
print('ASSET_STATS',json.dumps(stats))
