"""Gallery render of the exact original stitch graph used by the live scene.

blender -b --python scripts/blender/render_finished.py
node -e "require('sharp')('.local/blender-preview/embroidery-finished.png').webp({quality:92,effort:6}).toFile('public/art/embroidery-finished.webp')"

No stitch is substituted, discarded or redrawn. Every provided endpoint, color,
width and height supplies one raised thread spline. The copied input graph lives
beside this script so rebuilding does not depend on ephemeral .local contents.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(__file__).with_name('embroidery-pattern.json')
pattern=json.loads(SOURCE.read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def p(v):return Vector((v[0],-v[2],v[1]))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def color(hex):return tuple(linear(((hex>>shift)&255)/255) for shift in (16,8,0))
def material(name,col,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
    return m
def finish(o,name,mat,bevel=0):
    o.name=name;o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edge','BEVEL');mod.width=bevel;mod.segments=4
    for f in o.data.polygons:f.use_smooth=True
    mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return o
def box(name,loc,size,mat,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(loc));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel)
def cylinder(name,loc,r,depth,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=p(loc));return finish(bpy.context.object,name,mat,.004)

# Fine woven linen: crossed warp/weft waves with microscopic fiber irregularity.
linen=material('Linen | natural ivory',color(0xD9D1B9),.88)
n=linen.node_tree.nodes;l=linen.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Sheen Weight'].default_value=.26
tex=n.new('ShaderNodeTexCoord')
wave_x=n.new('ShaderNodeTexWave');wave_x.wave_type='BANDS';wave_x.bands_direction='X';wave_x.inputs['Scale'].default_value=220
wave_y=n.new('ShaderNodeTexWave');wave_y.wave_type='BANDS';wave_y.bands_direction='Y';wave_y.inputs['Scale'].default_value=150
for wave in (wave_x,wave_y):
    wave.inputs['Distortion'].default_value=.25;wave.inputs['Detail Scale'].default_value=2.5;l.new(tex.outputs['Generated'],wave.inputs['Vector'])
mix=n.new('ShaderNodeMath');mix.operation='MULTIPLY';l.new(wave_x.outputs['Fac'],mix.inputs[0]);l.new(wave_y.outputs['Fac'],mix.inputs[1])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.010;l.new(mix.outputs[0],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=160;noise.inputs['Detail'].default_value=2;l.new(tex.outputs['Generated'],noise.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(*color(0xCBC2A8),1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(*color(0xE9E0C8),1)
l.new(noise.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],bs.inputs['Base Color'])
box('Linen | tensioned rectangular ground',(0,.008,0),(pattern['cloth']['width'],.018,pattern['cloth']['height']),linen,.018)

# Exact stitch graph, grouped by color into eleven native Blender curve objects.
groups={}
for s in pattern['stitches']:groups.setdefault(s['color'],[]).append(s)
for rgb,stitches in groups.items():
    mat=material('Thread | %06x'%rgb,color(rgb),.52)
    b=mat.node_tree.nodes.get('Principled BSDF');b.inputs['Sheen Weight'].default_value=.32;b.inputs['Sheen Roughness'].default_value=.55
    cr=bpy.data.curves.new('Exact stitch curves | %06x'%rgb,'CURVE');cr.dimensions='3D';cr.bevel_depth=.01;cr.bevel_resolution=3;cr.resolution_u=8;cr.use_fill_caps=True
    for s in stitches:
        sp=cr.splines.new('POLY');sp.points.add(8)
        for k in range(9):
            t=k/8;x=s['a'][0]*(1-t)+s['b'][0]*t;z=s['a'][1]*(1-t)+s['b'][1]*t
            y=.025+s['height']*.34+math.sin(math.pi*t)*s['height']*.65
            sp.points[k].co=(*p((x,y,z)),1);sp.points[k].radius=s['width']*.75/.01
    o=bpy.data.objects.new('Exact stitches | %06x | %d'%(rgb,len(stitches)),cr);bpy.context.collection.objects.link(o);cr.materials.append(mat)
    o['source_stitch_count']=len(stitches)

# Slim walnut rails with grain, copper fixing screws and inset corner details.
walnut=material('Frame | dark oiled walnut',color(0x3C2A20),.34)
n=walnut.node_tree.nodes;l=walnut.node_tree.links;b=n.get('Principled BSDF')
tc=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(3,75,8);l.new(tc.outputs['Generated'],mapping.inputs[0])
wood=n.new('ShaderNodeTexNoise');wood.inputs['Scale'].default_value=4;wood.inputs['Detail'].default_value=3;wood.inputs['Roughness'].default_value=.65;l.new(mapping.outputs['Vector'],wood.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*color(0x211C18),1);ramp.color_ramp.elements[1].color=(*color(0x654631),1);l.new(wood.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],b.inputs['Base Color'])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.007;l.new(wood.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],b.inputs['Normal'])
copper=material('Fixings | brushed copper',color(0xAC6B42),.27,.82)
dark=material('Slots | oxidized recess',color(0x171B19),.7)
for x in (-2.84,2.84):box('Walnut | vertical tension rail',(x,.052,0),(.16,.12,3.99),walnut,.025)
for z in (-1.915,1.915):box('Walnut | horizontal tension rail',(0,.052,z),(5.54,.12,.16),walnut,.025)
for x in (-2.84,2.84):
    for z in (-1.915,1.915):
        cylinder('Copper | countersunk corner screw',(x,.119,z),.041,.016,copper)
        slot=box('Copper screw | engraved straight slot',(x,.129,z),(.053,.003,.008),dark,.002)
        slot.rotation_euler[2]=.35
for x in (-1.4,1.4):
    box('Walnut | inset underside joint',(x,-.016,-1.92),(.24,.035,.17),dark,.009)

# Dark gallery tabletop and large soft lights keep thread depth legible.
floor=material('Gallery | charcoal petrol',color(0x141E20),.72)
box('Gallery | surface',(0,-.10,0),(200,.08,200),floor,.01)
scene=bpy.context.scene;scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.035,.045,.055,1);bg.inputs['Strength'].default_value=.35
def light(name,loc,energy,size,col):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=col
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p(loc);o.rotation_euler=(p((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
light('Gallery | large warm silk',(-3,6,-2),700,5,(1,.89,.74))
light('Gallery | cool soft fill',(4,5,3),460,5,(.78,.89,1))
light('Gallery | raking fiber light',(-4,1.6,1),130,3,(1,.77,.53))
data=bpy.data.cameras.new('Gallery | camera');camera=bpy.data.objects.new('Gallery | camera',data);bpy.context.collection.objects.link(camera)
camera.location=p((.20,8.7,4.1));target=p((0,0,.04));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=6.75;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'.local/blender-preview/embroidery-finished.png')
print('EXACT_GRAPH '+json.dumps({'source':str(SOURCE),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceStitches':len(pattern['stitches']),'renderedSplines':sum(len(o.data.splines) for o in bpy.data.objects if o.type=='CURVE'),'colorGroups':len(groups)}))
bpy.ops.render.render(write_still=True)
