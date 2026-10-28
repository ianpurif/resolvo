"""Render a wide landing fallback from the actual editable machine model.

Run: blender -b --python scripts/blender/render_poster.py
Then convert .local/blender-preview/atelier-hero.png to the public WebP with sharp.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'scripts/blender/embroidery-machine.blend'))
def p(v):return Vector((v[0],-v[2],v[1]))
scene=bpy.context.scene
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value=(.012,.024,.028,1)
background.inputs['Strength'].default_value=.25
ground=bpy.data.materials['Studio | warm seamless']
ground.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.014,.026,.028,1)
ground.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.64
for name,power in [('STUDIO | giant silk key',820),('STUDIO | cool edge',1050),('STUDIO | front softbox',200),('STUDIO | needle macro fill',65)]:
    bpy.data.objects[name].data.energy=power
# Broad soft warm floor pool anchors the object without brightening copy space.
data=bpy.data.lights.new('STUDIO | copper floor pool','AREA');data.energy=170;data.shape='DISK';data.size=3.2;data.color=(1,.64,.34)
lamp=bpy.data.objects.new('STUDIO | copper floor pool',data);bpy.context.collection.objects.link(lamp);lamp.location=p((2.1,3.4,2.2));lamp.rotation_euler=(p((1.3,-.6,1.0))-lamp.location).to_track_quat('-Z','Y').to_euler()

# Original fine linen, physically modeled where it drapes off the front of the bed.
linen=bpy.data.materials.new('Poster | raw ivory linen');linen.use_nodes=True
nodes=linen.node_tree.nodes;links=linen.node_tree.links
bsdf=nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.63,.60,.51,1);bsdf.inputs['Roughness'].default_value=.86
bsdf.inputs['Sheen Weight'].default_value=.18
tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=380;tex.inputs['Detail'].default_value=2;tex.inputs['Roughness'].default_value=.65
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.23;bump.inputs['Distance'].default_value=.011
links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
nx,nz=160,110;verts=[];faces=[]
for j in range(nz+1):
    z=-.62+j/nz*3.25
    for i in range(nx+1):
        x=-2.35+i/nx*4.70
        front=max(0,z-.84);side=max(0,-x-1.80)
        y=.018-.095*front**2-.13*side**2
        y+=.007*math.sin(x*6.5+z*2.1)*min(1,front*1.7+side)
        verts.append(p((x,y,z)))
for j in range(nz):
    for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
mesh=bpy.data.meshes.new('Poster | draped linen grid');mesh.from_pydata(verts,[],faces);mesh.update()
fabric=bpy.data.objects.new('Poster | blank linen beneath stationary needle',mesh);bpy.context.collection.objects.link(fabric);fabric.data.materials.append(linen)
for poly in mesh.polygons:poly.use_smooth=True
solid=fabric.modifiers.new('Physical linen edge','SOLIDIFY');solid.thickness=.014

camera=scene.camera
camera.location=p((-8.5,6.0,12.5));target=p((1.12,1.82,.05));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=13.1;camera.data.shift_x=-.225;camera.data.shift_y=.005
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'.local/blender-preview/atelier-hero.png')
bpy.ops.render.render(write_still=True)
