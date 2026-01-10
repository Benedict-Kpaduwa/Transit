"""
Blender Decimation Script
Run this with: blender --background --python decimate_model.py -- input.glb output.glb 0.02

Arguments:
  input.glb  - path to the input GLB file
  output.glb - path for the decimated output GLB file  
  0.02       - decimation ratio (0.02 = keep 2% of faces)
"""

import bpy
import sys

def decimate_model(input_path, output_path, ratio=0.02):
    print(f"\n{'='*60}")
    print(f"Decimating: {input_path}")
    print(f"Output: {output_path}")
    print(f"Ratio: {ratio} (keeping {ratio*100}% of faces)")
    print(f"{'='*60}\n")
    
    # Clear existing objects
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Import the GLB file
    print("Importing GLB file...")
    bpy.ops.import_scene.gltf(filepath=input_path)
    
    # Get all mesh objects
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    
    print(f"Found {len(mesh_objects)} mesh objects")
    
    total_original_faces = 0
    total_decimated_faces = 0
    
    for obj in mesh_objects:
        # Select and make active
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        
        # Count original faces
        original_faces = len(obj.data.polygons)
        total_original_faces += original_faces
        
        # Apply all existing modifiers first
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except:
                pass
        
        # Add decimation modifier
        decimate = obj.modifiers.new(name="Decimate", type='DECIMATE')
        decimate.decimate_type = 'COLLAPSE'
        decimate.ratio = ratio
        
        # Apply the modifier
        bpy.ops.object.modifier_apply(modifier="Decimate")
        
        # Count new faces
        new_faces = len(obj.data.polygons)
        total_decimated_faces += new_faces
        
        print(f"  {obj.name}: {original_faces:,} -> {new_faces:,} faces")
        
        obj.select_set(False)
    
    print(f"\nTotal: {total_original_faces:,} -> {total_decimated_faces:,} faces")
    print(f"Reduction: {(1 - total_decimated_faces/total_original_faces)*100:.1f}%")
    
    # Export the decimated model
    print(f"\nExporting to: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_materials='NONE',  # Don't export materials/textures to reduce size
        export_cameras=False,
        export_lights=False,
    )
    
    print("\n✅ Done!")

if __name__ == "__main__":
    # Get arguments after "--"
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        print("Usage: blender --background --python decimate_model.py -- input.glb output.glb [ratio]")
        sys.exit(1)
    
    if len(argv) < 2:
        print("Usage: blender --background --python decimate_model.py -- input.glb output.glb [ratio]")
        sys.exit(1)
    
    input_path = argv[0]
    output_path = argv[1]
    ratio = float(argv[2]) if len(argv) > 2 else 0.02
    
    decimate_model(input_path, output_path, ratio)
