"""Original Resolvo Atelier 01 embroidery machine, authored entirely in Blender.

Run from the repository root:
  .local/blender-tools/blender-4.5.15-windows-x64/blender.exe -b --python scripts/blender/build_machine.py
All design coordinates are Three.js Y-up; p() handles Blender's Z-up system.
"""
import bpy, math, json, random, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
PREVIEW = ROOT / '.local/blender-preview'
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def p(v): return Vector((v[0], -v[2], v[1]))
def material(name, color, metallic=0, roughness=.35, brushed=False):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if brushed:
        random.seed(37)
        image = bpy.data.images.new(name + '_microfinish', width=128, height=128)
        pixels=[]
        for row in range(128):
            r=roughness+random.uniform(-.035,.035)
            for col in range(128):
                v=max(0,min(1,r+random.uniform(-.008,.008)))
                pixels.extend((v,v,v,1))
        image.pixels=pixels
        image.colorspace_settings.name='Non-Color'
        image.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Roughness'])
    return m

ivory=material('Ceramic | warm porcelain',(.78,.75,.66),.05,.28)
edge=material('Ceramic | recessed warm edge',(.49,.48,.43),.12,.34)
slate=material('Enamel | midnight slate',(.025,.047,.052),.32,.30)
rubber=material('Rubber | charcoal',(.014,.019,.019),0,.7)
steel=material('Metal | brushed satin steel',(.54,.59,.60),.92,.29,True)
chrome=material('Metal | polished needle steel',(.7,.75,.77),1,.15)
copper=material('Metal | burnished copper',(.53,.24,.105),.85,.28,True)
ink=material('Lettering | graphite',(.033,.056,.059),.1,.5)
thread=material('Thread | kingfisher teal',(.03,.25,.25),0,.7)
spoolcore=material('Spool | unbleached card',(.51,.40,.25),0,.8)
amber=material('Indicator | warm amber',(.95,.49,.13),.1,.2)
bs=amber.node_tree.nodes.get('Principled BSDF')
bs.inputs['Emission Color'].default_value=(1,.36,.08,1)
bs.inputs['Emission Strength'].default_value=.35

machine=[]
def finish(o,name,mat,bevel=0,segments=3,smooth=True):
    o.name=name
    if mat:o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Manufactured edge radii','BEVEL'); mod.width=bevel; mod.segments=segments
        mod.profile=.5
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth and o.type=='MESH':
        for f in o.data.polygons:f.use_smooth=True
        mod=o.modifiers.new('Area weighted workshop normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    machine.append(o)
    return o

def box(name,loc,size,mat,bevel=.03,segments=4):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(loc))
    o=bpy.context.object; o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel,segments)

def cyl(name,loc,radius,depth,mat,axis=(0,1,0),vertices=48,bevel=.008,radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=p(loc))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius2,depth=depth,location=p(loc))
    o=bpy.context.object; o.rotation_euler=p(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,bevel,2)

def torus(name,loc,major,minor,mat,axis=(0,1,0),major_segments=64,minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments,minor_segments=minor_segments,location=p(loc),major_radius=major,minor_radius=minor)
    o=bpy.context.object; o.rotation_euler=p(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat)

def tube(name,points,radius,mat,cyclic=False,resolution=3):
    cr=bpy.data.curves.new(name,'CURVE'); cr.dimensions='3D'; cr.resolution_u=12
    cr.bevel_depth=radius; cr.bevel_resolution=resolution
    sp=cr.splines.new('POLY'); sp.points.add(len(points)-1)
    for v,co in zip(sp.points,points):v.co=(*p(co),1)
    sp.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,cr); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o=bpy.context.object
    o.select_set(False)
    return finish(o,name,mat)

def profile(name,coords,zmin,zmax,mat,bevel=.10):
    n=len(coords); verts=[p((x,y,z)) for z in (zmin,zmax) for x,y in coords]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o
    o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    return finish(o,name,mat,bevel,6)

def screw(name,loc,r=.045,axis=(0,0,1)):
    cyl(name+' | countersunk rim',loc,r,.018,steel,axis,24,.004)
    cyl(name+' | head',tuple(loc[i]+axis[i]*.009 for i in range(3)),r*.78,.014,chrome,axis,24,.003)
    if axis==(0,0,1):box(name+' | cut slot',(loc[0],loc[1],loc[2]+.018),(r*1.15,.012,.006),ink,.003,2)
    elif axis==(0,1,0):box(name+' | cut slot',(loc[0],loc[1]+.018,loc[2]),(r*1.15,.006,.012),ink,.003,2)

def label(name,text,loc,size,mat,align='LEFT',extrude=.0008):
    cr=bpy.data.curves.new(name,'FONT');cr.body=text;cr.size=size;cr.space_character=1.16;cr.extrude=extrude;cr.bevel_depth=.0003;cr.align_x=align
    o=bpy.data.objects.new(name,cr);bpy.context.collection.objects.link(o);o.location=p(loc);o.rotation_euler=(math.pi/2,0,0)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False)
    return finish(o,name,mat,smooth=False)

# The shell is a deliberately profiled casting, not intersecting primitive blocks.
outline=[(-.58,1.46),(-.65,2.83),(-.42,3.22),(.02,3.38),(2.88,3.38),(3.53,3.14),(3.94,2.66),(4.08,-.16),(2.75,-.16),(2.63,2.08),(.56,2.08),(.49,1.46)]
profile('Atelier | one-piece C casting',outline,-1.46,-.40,ivory,.14)
# Deep slate inset follows the right shoulder and gives the silhouette visual weight.
profile('Atelier | inset tower panel',[(2.92,.19),(3.86,.19),(3.73,2.54),(3.4,2.96),(2.96,3.13),(2.86,2.86)],-1.50,-1.44,slate,.07)
profile('Atelier | front service panel',[(2.95,.36),(3.80,.36),(3.68,2.49),(3.39,2.87),(2.94,3.02),(2.86,2.76)],-.405,-.377,slate,.055)
profile('Atelier | sculpted needle cover',[(-.47,1.43),(-.54,2.79),(-.32,3.04),(.28,3.04),(.49,2.76),(.42,1.43)],-.43,.235,ivory,.10)
profile('Atelier | needle cover seam',[(-.47,1.44),(-.54,2.78),(-.32,3.04),(.28,3.04),(.49,2.76),(.42,1.44)],-.442,-.424,edge,.055)
box('Atelier | under-head chrome sole',(-.015,1.43,-.035),(.76,.07,.70),steel,.06)
box('Atelier | shadowline base',(1.25,-.39,-.60),(6.25,.16,3.0),slate,.15,6)
box('Atelier | ceramic bed',(1.25,-.245,-.60),(6.2,.27,2.95),ivory,.14,6)
box('Atelier | bed lower copper reveal',(1.25,-.335,-.60),(6.19,.022,2.94),copper,.11,5)
for x in (-1.15,3.63):
    for z in (-1.65,.44):cyl('Isolated rubber foot',(x,-.53,z),.18,.18,rubber,bevel=.04)
# Inlaid slide plate and actual slotted feed-dog construction, visible at macro distance.
box('Throat | slide plate recess',(-.35,-.095,-.015),(1.59,.035,1.58),ink,.08)
box('Throat | brushed removable slide plate',(-.49,-.071,-.015),(1.25,.03,1.48),steel,.06)
box('Throat | needle plate',(0,-.044,.005),(.66,.035,.91),chrome,.055)
box('Throat | needle aperture',(0,-.023,.002),(.11,.006,.13),ink,.04)
for x in (-.205,.205):
    box('Feed dog | black slot',(x,-.020,.06),(.115,.008,.58),ink,.035)
    for i in range(12):
        box('Feed dog | individual steel tooth',(x,-.011,-.19+i*.043),(.079,.016,.018),steel,.004,2)
for x in (-.28,.28):screw('Throat | screw',(x,-.019,-.30),.037,(0,1,0))
for i in range(7):
    box('Throat | etched seam gauge',(.37+i*.065,-.052,.08),(.009,.004,.53),ink,.001,1)
# Presser assembly: separate rear shaft, articulated ankle, split toe, needle clearance.
cyl('Presser | vertical polished shaft',(.015,.91,-.25),.052,1.10,chrome,bevel=.008)
cyl('Presser | lower bushing',(.015,.43,-.25),.086,.15,steel,bevel=.012)
box('Presser | hinged ankle',(.015,.29,-.25),(.19,.21,.17),steel,.025)
cyl('Presser | ankle pin',(.015,.28,-.25),.047,.27,chrome,(1,0,0),32,.006)
box('Presser | heel bridge',(0,.115,-.15),(.34,.09,.25),steel,.035)
for x in (-.115,.115):
    profile('Presser | rounded open toe',[(x-.055,.065),(x+.055,.065),(x+.055,.125),(x-.055,.125)],-.19,.31,chrome,.035)
    box('Presser | raised tip',(x,.12,.295),(.105,.075,.10),chrome,.035)
box('Presser | ceramic light inset',(-.30,1.382,.0),(.15,.018,.28),amber,.035)
# Animated assembly. Its local Y is glTF / Three Y; script preserves pivot hierarchy.
needle_pivot=bpy.data.objects.new('NeedlePivot',None);bpy.context.collection.objects.link(needle_pivot)
needle_pivot.location=p((0,1.05,0));needle_pivot.empty_display_size=.15
needle_parts=[]
def moving(o):needle_parts.append(o);return o
# Rest endpoints .51..1.84: lower end clears the heel at .33 descent,
# upper end retains .115 insertion into the head sole at full stroke.
moving(cyl('Needle | reciprocating bar',(0,1.175,0),.047,1.33,chrome,bevel=.006))
moving(cyl('Needle | bar collar',(0,.70,0),.082,.12,steel,bevel=.012))
moving(box('Needle | clamp block',(0,.60,0),(.17,.15,.13),steel,.022))
moving(cyl('Needle | clamp thumbscrew',(.135,.60,0),.058,.17,steel,(1,0,0),32,.008))
moving(cyl('Needle | thumbscrew cap',(.226,.60,0),.07,.035,copper,(1,0,0),32,.006))
for i in range(12):
    a=i*math.tau/12
    moving(box('Needle | thumbscrew knurl',(.224,.60+math.cos(a)*.068,math.sin(a)*.068),(.027,.014,.014),steel,.003,2))
# Shaft ends above the open eye. The tapered ring makes a genuine visible eye hole.
moving(cyl('Needle | hardened shaft',(0,.447,0),.014,.19,chrome,vertices=24,bevel=.002))
eye_points=[(.014*math.cos(i*math.tau/32),.320+.034*math.sin(i*math.tau/32),0) for i in range(32)]
moving(tube('Needle | open eye',eye_points,.006,chrome,True,2))
moving(cyl('Needle | tapered point',(0,.247,0),0,.094,chrome,vertices=24,bevel=0,radius2=.012))
for o in needle_parts:
    matrix=o.matrix_world.copy();o.parent=needle_pivot;o.matrix_world=matrix
needle_pivot['rest_tip_world']=[0,.20,0]
needle_pivot['rest_eye_world']=[0,.32,0]
needle_pivot['recommended_vertical_travel']=.33
# Pressure dial, tension stack and take-up slot, each physically layered.
cyl('Pressure | bezel',(-.02,3.15,-.12),.17,.14,steel,bevel=.014)
cyl('Pressure | knurled cap',(-.02,3.245,-.12),.14,.08,slate,bevel=.015)
for i in range(28):
    a=i*math.tau/28
    cyl('Pressure | knurl',(-.02+.139*math.cos(a),3.245,-.12+.139*math.sin(a)),.009,.058,steel,vertices=8,bevel=0)
box('Take-up | recessed slot',(-.18,2.39,.245),(.095,.67,.018),ink,.04)
tube('Take-up | lever',[(-.18,2.70,.27),(-.22,2.91,.33),(-.09,3.04,.36)],.023,steel)
torus('Take-up | thread eye',(-.09,3.04,.36),.052,.016,chrome,(0,0,1),40,8)
for depth,r,mat in ((.254,.19,ink),(.28,.16,steel),(.315,.145,chrome),(.35,.145,chrome),(.39,.102,copper),(.435,.094,slate)):
    cyl('Tension | layered disc',(.29,2.40,depth),r,.035,mat,(0,0,1),48,.008)
for i in range(24):
    a=i*math.tau/24
    cyl('Tension | dial knurl',(.29+.093*math.cos(a),2.40+.093*math.sin(a),.449),.007,.03,steel,(0,0,1),8,0)
torus('Tension | compensation spring',(.29,2.40,.324),.182,.011,copper,(0,0,1),52,8)
for x,y in [(-.34,1.61),(.28,1.61),(-.32,2.79),(.29,2.79)]:screw('Head | service screw',(x,y,.241),.031)
# The right-mounted handwheel: machined concentric faces, rim, recess and balance marks.
cyl('Handwheel | drive axle',(4.00,2.61,-.89),.18,.40,chrome,(1,0,0),48,.012)
cyl('Handwheel | main disc',(4.20,2.61,-.89),.62,.27,slate,(1,0,0),96,.045)
torus('Handwheel | satin outer rim',(4.35,2.61,-.89),.545,.06,steel,(1,0,0),96,12)
cyl('Handwheel | recessed center',(4.36,2.61,-.89),.435,.025,rubber,(1,0,0),64,.015)
cyl('Handwheel | brushed hub',(4.39,2.61,-.89),.24,.07,steel,(1,0,0),64,.018)
cyl('Handwheel | copper end cap',(4.433,2.61,-.89),.11,.03,copper,(1,0,0),48,.008)
for i in range(8):
    a=i*math.tau/8
    cyl('Handwheel | lightening pocket',(4.379,2.61+math.cos(a)*.34,-.89+math.sin(a)*.34),.048,.025,ink,(1,0,0),24,.008)
for i in range(48):
    a=i*math.tau/48
    cyl('Handwheel | grip rib',(4.19,2.61+math.cos(a)*.612,-.89+math.sin(a)*.612),.008,.17,rubber,(1,0,0),8,0)
# Brass brand badge and scale create a small, legible industrial identity.
box('Brand | inset porcelain plaque',(1.52,2.80,-.376),(1.56,.35,.028),ivory,.04)
label('Brand | RESOLVO','RESOLVO',(1.51,2.755,-.352),.205,ink,'CENTER')
label('Brand | atelier series','A T E L I E R  /  0 1',(1.51,2.54,-.375),.065,ink,'CENTER')
box('Brand | copper hallmark',(.71,2.80,-.345),(.06,.20,.02),copper,.01)
label('Panel | model designation','01',(3.31,2.32,-.345),.30,ivory,'CENTER')
label('Panel | machine type','PRECISION  /  STITCH',(3.29,2.13,-.343),.065,ivory,'CENTER')
for y in (1.00,1.12,1.24,1.36,1.48):box('Panel | cooling louvre',(3.32,y,-.342),(.50,.024,.035),rubber,.009,3)
for x,y in ((3.05,.53),(3.64,.53),(3.05,2.72),(3.48,2.72)):screw('Panel | service screw',(x,y,-.342),.035)
cyl('Panel | stitch dial bezel',(3.31,1.83,-.342),.19,.05,steel,(0,0,1),48,.01)
cyl('Panel | stitch dial',(3.31,1.83,-.30),.148,.08,slate,(0,0,1),48,.018)
box('Panel | dial pointer',(3.31,1.935,-.251),(.016,.055,.01),copper,.003)
for i in range(9):
    a=(-.75+i/8*1.5)*math.pi
    cyl('Panel | scale mark',(3.31+math.sin(a)*.217,1.83+math.cos(a)*.217,-.337),.008,.007,ivory,(0,0,1),8,0)
cyl('Panel | status lamp rim',(3.31,.72,-.338),.053,.035,steel,(0,0,1),32,.004)
cyl('Panel | status lamp',(3.31,.72,-.312),.030,.021,amber,(0,0,1),32,.008)
# Spool stand, card core, wound yarn and polished guide tree.
cyl('Spool | seat',(2.40,3.43,-.96),.33,.06,steel,bevel=.015)
cyl('Spool | pin',(2.40,3.97,-.96),.035,1.10,chrome,vertices=32,bevel=.005)
cyl('Spool | cardboard core',(2.40,3.91,-.96),.116,.88,spoolcore,bevel=.012)
cyl('Spool | yarn mass',(2.40,3.91,-.96),.255,.76,thread,vertices=64,bevel=.035,radius2=.225)
for i in range(56):
    y=3.55+i*.013
    r=.253-(y-3.55)*.036
    torus('Spool | individual wound turn',(2.40,y,-.96),r,.0065,thread,major_segments=48,minor_segments=4)
for y in (3.49,4.34):cyl('Spool | copper end flange',(2.40,y,-.96),.29,.038,copper,vertices=64,bevel=.008)
cyl('Spool | top core opening',(2.40,4.367,-.96),.078,.009,ink,vertices=32,bevel=0)
tube('Thread tree | bent upright',[(2.91,3.38,-1.13),(2.91,4.53,-1.13),(2.87,4.62,-1.13),(2.35,4.62,-1.13)],.023,chrome)
torus('Thread tree | eye',(2.35,4.57,-1.13),.052,.016,chrome,(0,0,1),40,8)
cyl('Thread tree | socket',(2.91,3.43,-1.13),.077,.10,steel,vertices=32,bevel=.01)
guides={'ThreadGuideTop':[2.35,4.57,-1.13],'ThreadGuideShoulder':[1.12,3.43,-.48],'ThreadGuideTension':[.29,2.40,.37],'ThreadGuideTakeup':[-.09,3.04,.36],'ThreadGuideLower':[.03,1.35,.17]}
for name,loc in guides.items():
    empty=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(empty);empty.location=p(loc);empty.empty_display_size=.06
for name,loc in [('Thread guide | shoulder',guides['ThreadGuideShoulder']),('Thread guide | lower',guides['ThreadGuideLower'])]:
    torus(name,loc,.038,.012,chrome,(0,0,1),32,8)
tube('Thread | upper continuous teal route',[(2.40,4.27,-.72),(2.35,4.57,-1.13),(1.12,3.43,-.48),(.65,3.20,.15),(.42,2.49,.37),(.41,2.30,.37),(.25,2.28,.37),(-.09,3.04,.36),(-.02,2.02,.29),(.03,1.35,.17)],.008,thread,resolution=2)
# Small rear mechanics visible during an orbit.
box('Rear | motor housing',(3.20,1.12,-1.66),(1.10,.72,.53),slate,.15,5)
for i in range(6):box('Rear | motor fin',(2.82+i*.15,1.12,-1.96),(.025,.43,.09),steel,.01)
box('Rear | power socket',(3.64,.42,-1.49),(.23,.24,.06),rubber,.035)

# Apply a sane UV fallback to custom casting pieces, then merge static geometry by finish.
for o in machine:
    if o.type=='MESH' and not o.data.uv_layers:
        uv=o.data.uv_layers.new(name='AtelierUV')
        for polygon in o.data.polygons:
            for li in polygon.loop_indices:
                co=o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(co.x*.5,co.z*.5)
root=bpy.data.objects.new('EmbroideryMachine',None);bpy.context.collection.objects.link(root)
handwheel_pivot=bpy.data.objects.new('HandwheelPivot',None);bpy.context.collection.objects.link(handwheel_pivot)
handwheel_pivot.location=p((4.20,2.61,-.89));handwheel_pivot.empty_display_size=.3
handwheel_pivot['rotation_axis']='local X';handwheel_pivot['center_world']=[4.20,2.61,-.89]
wheel_parts=[o for o in machine if o.name.startswith('Handwheel |') and o.name!='Handwheel | drive axle']
static=[o for o in machine if o not in needle_parts and o not in wheel_parts]
merged=[]
materials=[ivory,edge,slate,rubber,steel,chrome,copper,ink,thread,spoolcore,amber]
groups=[(mat,[o for o in static if o.data.materials and o.data.materials[0]==mat]) for mat in materials]
for mat,objs in groups:
    if not objs:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
    o=bpy.context.object;o.name='MachineStatic_'+mat.name.split(' | ')[0]+'_'+mat.name.split(' | ')[1].replace(' ','_')
    matrix=o.matrix_world.copy();o.parent=root;o.matrix_world=matrix;merged.append(o)
moving_groups=[(mat,[o for o in needle_parts if o.data.materials and o.data.materials[0]==mat]) for mat in materials]
needle_parts=[]
for mat,objs in moving_groups:
    if not objs:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
    o=bpy.context.object;o.name='NeedleAssembly_'+mat.name.split(' | ')[1].replace(' ','_')
    needle_parts.append(o)
wheel_groups=[(mat,[o for o in wheel_parts if o.data.materials and o.data.materials[0]==mat]) for mat in materials]
wheel_parts=[]
for mat,objs in wheel_groups:
    if not objs:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
    o=bpy.context.object;o.name='HandwheelAssembly_'+mat.name.split(' | ')[1].replace(' ','_')
    matrix=o.matrix_world.copy();o.parent=handwheel_pivot;o.matrix_world=matrix;wheel_parts.append(o)
needle_pivot.parent=root
handwheel_pivot.parent=root
for name in guides:bpy.data.objects[name].parent=root
bpy.ops.object.select_all(action='DESELECT')
for o in [root,needle_pivot,handwheel_pivot]+needle_parts+wheel_parts+merged+[bpy.data.objects[n] for n in guides]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'embroidery-machine.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
tris=sum(sum(len(poly.vertices)-2 for poly in o.data.polygons) for o in merged+needle_parts+wheel_parts)
report={'asset':'/models/embroidery-machine.glb','coordinateSystem':'glTF Y up; fabric XZ y=0','needlePivot':[0,1.05,0],'needleTip':[0,.20,0],'needleEye':[0,.32,0],'travel':.33,'handwheelPivot':[4.20,2.61,-.89],'handwheelRotationAxis':'local X','guides':guides,'triangles':tris,'meshCount':len(merged)+len(needle_parts)+len(wheel_parts),'bytes':(OUT/'embroidery-machine.glb').stat().st_size,'staticMeshes':[o.name for o in merged],'animatedMeshes':[o.name for o in needle_parts],'handwheelMeshes':[o.name for o in wheel_parts]}
(OUT/'embroidery-machine.manifest.json').write_text(json.dumps(report,indent=2))
print('ASSET_REPORT '+json.dumps(report))

# Studio presentation is saved in the editable .blend but excluded from the GLB.
floor=material('Studio | warm seamless',(.58,.55,.47),0,.8)
ground=box('STUDIO | ground',(1,-.68,0),(200,.10,200),floor,.01)
def area(name,loc,power,size,color,target=(1,1.5,-.3)):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p(loc);o.rotation_euler=(p(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO | giant silk key',(-3,7,5),1100,7,(1,.88,.73))
area('STUDIO | cool edge',(5,6,-4),1400,5,(.72,.84,1))
area('STUDIO | front softbox',(1,4,7),500,5,(1,1,1))
area('STUDIO | needle macro fill',(-2,2,3),110,2,(.8,.9,1),(.1,.5,0))
camera_data=bpy.data.cameras.new('STUDIO | camera');camera=bpy.data.objects.new('STUDIO | camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=p((-7.8,5.7,10.7));target=p((1.25,1.85,-.3));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=8.8;bpy.context.scene.camera=camera
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world.color=(.24,.24,.24);scene.render.resolution_x=1600;scene.render.resolution_y=1300;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW/'atelier-machine.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scripts/blender/embroidery-machine.blend'),compress=True)
if '--skip-render' in sys.argv:
    sys.exit(0)
bpy.ops.render.render(write_still=True)
camera.location=p((-1.6,1.1,2.8));target=p((0,.65,.02));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=1.7
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.filepath=str(PREVIEW/'atelier-needle-macro.png')
bpy.ops.render.render(write_still=True)
