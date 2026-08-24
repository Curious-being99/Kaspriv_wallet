#!/bin/bash
set -e

# Dimensions for each density
declare -A sizes=(
  ["mdpi"]=48
  ["hdpi"]=72
  ["xhdpi"]=96
  ["xxhdpi"]=144
  ["xxxhdpi"]=192
)

for density in "${!sizes[@]}"; do
  size=${sizes[$density]}
  dir="android/app/src/main/res/mipmap-${density}"
  mkdir -p "$dir"
  
  echo "Generating for $density ($size x $size)"
  
  # Background color: Slate 900 (#0F172A)
  # Foreground element: Kaspa Teal (#70C7BA)
  
  # 1. ic_launcher_foreground.png (Transparent background with Teal icon in middle)
  convert -size ${size}x${size} canvas:transparent \
    -fill "#70C7BA" -draw "circle $(($size/2)),$(($size/2)) $(($size/2)),$(($size/4))" \
    -define png:color-type=6 -define png:bit-depth=8 \
    "$dir/ic_launcher_foreground.png"

  # 2. ic_launcher.png (Slate background with Teal icon in middle)
  convert -size ${size}x${size} canvas:"#0F172A" \
    -fill "#70C7BA" -draw "circle $(($size/2)),$(($size/2)) $(($size/2)),$(($size/4))" \
    -define png:color-type=6 -define png:bit-depth=8 \
    "$dir/ic_launcher.png"

  # 3. ic_launcher_round.png (Round slate background with Teal icon in middle)
  convert -size ${size}x${size} canvas:transparent \
    -fill "#0F172A" -draw "circle $(($size/2)),$(($size/2)) $(($size/2)),0" \
    -fill "#70C7BA" -draw "circle $(($size/2)),$(($size/2)) $(($size/2)),$(($size/4))" \
    -define png:color-type=6 -define png:bit-depth=8 \
    "$dir/ic_launcher_round.png"
done

# Splash screens
convert -size 480x800 canvas:"#0F172A" -define png:color-type=6 -define png:bit-depth=8 "android/app/src/main/res/drawable/splash.png"
convert -size 800x480 canvas:"#0F172A" -define png:color-type=6 -define png:bit-depth=8 "android/app/src/main/res/drawable-land-hdpi/splash.png"

echo "All PNGs generated successfully with ImageMagick!"
