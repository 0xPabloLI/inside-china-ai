#!/usr/bin/env python3
"""
Convert a PNG to SVG by embedding as base64 data URI.
This preserves 100% visual fidelity. The SVG is technically a wrapper around the raster image,
but it's valid SVG and can be inlined in HTML like any other SVG.
"""
import base64
import sys

def png_to_svg_embed(input_png, output_svg):
    with open(input_png, 'rb') as f:
        png_data = f.read()
    
    b64 = base64.b64encode(png_data).decode('ascii')
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <image width="1024" height="1024" xlink:href="data:image/png;base64,{b64}"/>
</svg>'''
    
    with open(output_svg, 'w') as f:
        f.write(svg)
    
    print(f"SVG (embedded PNG) saved: {output_svg}")
    print(f"File size: {len(svg)} bytes ({len(svg)/1024:.0f}KB)")

if __name__ == '__main__':
    input_png = sys.argv[1] if len(sys.argv) > 1 else '/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/Weixin Image_20260731192706_43_538.png'
    output_svg = sys.argv[2] if len(sys.argv) > 2 else '/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/china-ai-news-logo-new.svg'
    png_to_svg_embed(input_png, output_svg)
