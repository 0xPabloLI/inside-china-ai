#!/usr/bin/env python3
"""
Convert a multi-color PNG logo to SVG using potrace.
Strategy: separate the image into color layers, trace each with potrace,
then combine into a single SVG with proper fills.
"""
import subprocess
import sys
import os
import tempfile
from PIL import Image
import numpy as np

def png_to_svg(input_png, output_svg):
    img = Image.open(input_png).convert('RGBA')
    arr = np.array(img)
    alpha = arr[:, :, 3]
    
    # Define color layers to trace (based on analysis)
    # Main colors: blue/purple, red, black
    layers = [
        # (name, color_range, fill_color)
        ("blue", (40, 60, 140), [32, 64, 128]),
        ("dark_blue", (20, 30, 80), [32, 32, 96]),
        ("deep_blue", (0, 0, 40), [0, 0, 32]),
        ("red", (200, 30, 30), [224, 32, 32]),
        ("dark_red", (200, 30, 60), [224, 32, 64]),
        ("black", (0, 0, 0), [0, 0, 0]),
    ]
    
    svg_parts = []
    bbox = None
    
    nonzero = np.where(alpha > 10)
    if len(nonzero[0]) > 0:
        y_min, y_max = nonzero[0].min(), nonzero[0].max()
        x_min, x_max = nonzero[1].min(), nonzero[1].max()
        bbox = (x_min, y_min, x_max, y_max)
    
    width, height = img.size
    
    for name, target_rgb, fill_rgb in layers:
        # Create a mask for this color layer
        rgb = arr[:, :, :3]
        # Distance to target color
        dist = np.sqrt(((rgb.astype(float) - np.array(target_rgb)) ** 2).sum(axis=2))
        mask = (dist < 60) & (alpha > 128)
        
        if mask.sum() < 100:  # Skip tiny layers
            continue
        
        # Create a PBM (portable bitmap) for potrace
        # White = 0 (background), Black = 1 (trace)
        pbm = Image.fromarray((~mask * 255).astype(np.uint8), mode='L')
        
        # Crop to bounding box to reduce file size
        if bbox:
            x0, y0, x1, y1 = bbox
            # Add some padding
            pad = 10
            x0 = max(0, x0 - pad)
            y0 = max(0, y0 - pad)
            x1 = min(width, x1 + pad)
            y1 = min(height, y1 + pad)
            pbm = pbm.crop((x0, y0, x1, y1))
        else:
            x0, y0 = 0, 0
        
        # Save as PBM
        with tempfile.NamedTemporaryFile(suffix='.pbm', delete=False) as f:
            pbm_path = f.name
        pbm.save(pbm_path)
        
        # Run potrace to get SVG
        with tempfile.NamedTemporaryFile(suffix='.svg', delete=False, mode='w') as f:
            svg_path = f.name
        
        result = subprocess.run(
            ['potrace', pbm_path, '-s', '-o', svg_path, '--flat', '--tight', '-t', '0.5'],
            capture_output=True, text=True
        )
        
        if result.returncode == 0 and os.path.exists(svg_path):
            with open(svg_path, 'r') as f:
                svg_content = f.read()
            
            # Extract the path data from the SVG
            # potrace outputs: <svg ...><path d="..." .../></svg>
            import re
            path_match = re.search(r'd="([^"]*)"', svg_content)
            if path_match:
                path_data = path_match.group(1)
                fill = f'rgb({fill_rgb[0]},{fill_rgb[1]},{fill_rgb[2]})'
                # Apply offset for cropping
                transform = f'translate({x0},{y0})'
                svg_parts.append(f'  <g transform="{transform}"><path d="{path_data}" fill="{fill}" fill-rule="evenodd"/></g>')
        
        os.unlink(pbm_path)
        if os.path.exists(svg_path):
            os.unlink(svg_path)
    
    # Combine all layers into one SVG
    with open(output_svg, 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">\n')
        for part in svg_parts:
            f.write(part + '\n')
        f.write('</svg>\n')
    
    print(f"SVG saved: {output_svg}")
    print(f"Layers traced: {len(svg_parts)}")

if __name__ == '__main__':
    input_png = sys.argv[1] if len(sys.argv) > 1 else '/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/Weixin Image_20260731192706_43_538.png'
    output_svg = sys.argv[2] if len(sys.argv) > 2 else '/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/china-ai-news-logo-new.svg'
    png_to_svg(input_png, output_svg)
