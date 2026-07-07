# -*- coding: utf-8 -*-
"""
ECO Image Analyzer — uses Ultralytics YOLOv8 for object classification
and OpenCV/PIL for color and design texture analysis.
"""
import os
import sys
import json
import numpy as np

# We import PIL and cv2 inside try-catch to allow safe fallbacks
try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import cv2
except ImportError:
    cv2 = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


def get_dominant_color_name(hsv_img):
    """
    Given an HSV image array, returns the dominant color name.
    """
    if hsv_img is None or hsv_img.size == 0:
        return "unknown"

    h, s, v = cv2.split(hsv_img)
    
    # Calculate averages
    avg_s = np.mean(s)
    avg_v = np.mean(v)
    
    # Check for grayscale / neutrals
    if avg_v < 40:
        return "black"
    if avg_v > 210 and avg_s < 25:
        return "white"
    if avg_s < 20:
        return "grey"

    # Flatten H channel to build histogram
    h_flat = h.flatten()
    # Filter out neutral pixels (low saturation/value)
    mask = (s.flatten() > 30) & (v.flatten() > 40)
    h_filtered = h_flat[mask]

    if len(h_filtered) == 0:
        return "grey"

    # Build histogram for H channel (0-180 in OpenCV)
    hist, bin_edges = np.histogram(h_filtered, bins=18, range=(0, 180))
    dominant_bin = np.argmax(hist)
    h_val = dominant_bin * 10 + 5  # center of bin

    # Map Hue center value to color name
    if h_val < 8 or h_val >= 165:
        return "red"
    elif h_val < 22:
        return "orange"
    elif h_val < 38:
        return "yellow"
    elif h_val < 85:
        return "green"
    elif h_val < 135:
        return "blue"
    elif h_val < 155:
        return "purple"
    else:
        return "pink"


def get_design_texture(gray_img):
    """
    Analyzes texture/design based on edge density and intensity variance.
    """
    if gray_img is None or gray_img.size == 0:
        return "solid"

    # Calculate variance of Laplacians (blur / texture indicator)
    laplacian_var = cv2.Laplacian(gray_img, cv2.CV_64F).var()
    
    # Edge density using Canny
    edges = cv2.Canny(gray_img, 50, 150)
    edge_density = np.mean(edges > 0)

    if edge_density > 0.08 and laplacian_var > 300:
        return "patterned"
    elif edge_density > 0.03 and laplacian_var > 150:
        return "textured"
    else:
        return "solid"


def analyze_image(image_path):
    result = {
        "success": False,
        "detected_object": "product",
        "color": "unknown",
        "pattern": "unknown",
        "query": "product"
    }

    if not os.path.exists(image_path):
        result["error"] = f"File not found: {image_path}"
        return result

    # 1. Fallback / Pre-check if cv2 is not available
    if cv2 is None:
        result["error"] = "OpenCV (cv2) is not installed."
        result["query"] = "product"
        return result

    # Load image using OpenCV
    img = cv2.imread(image_path)
    if img is None:
        result["error"] = "Failed to load image file."
        return result

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Default color/design from whole image
    result["color"] = get_dominant_color_name(hsv)
    result["pattern"] = get_design_texture(gray)

    # 2. Try YOLO object detection if installed
    if YOLO is not None:
        try:
            # Load small nano model yolov8n.pt (will auto-download if missing)
            # Suppress logging by setting verbose=False
            model = YOLO("yolov8n.pt")
            preds = model.predict(source=image_path, verbose=False)
            
            if len(preds) > 0 and len(preds[0].boxes) > 0:
                # Find most prominent box (largest area)
                best_box = None
                max_area = 0
                
                for box in preds[0].boxes:
                    coords = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                    w = coords[2] - coords[0]
                    h_dim = coords[3] - coords[1]
                    area = w * h_dim
                    if area > max_area:
                        max_area = area
                        best_box = box

                if best_box is not None:
                    # Get class name
                    class_id = int(best_box.cls[0].item())
                    class_name = model.names[class_id]
                    result["detected_object"] = class_name
                    
                    # Crop image for precise color/design analysis on target object
                    coords = best_box.xyxy[0].tolist()
                    x1, y1, x2, y2 = map(int, coords)
                    crop_img = img[y1:y2, x1:x2]
                    
                    if crop_img.size > 0:
                        crop_hsv = cv2.cvtColor(crop_img, cv2.COLOR_BGR2HSV)
                        crop_gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY)
                        result["color"] = get_dominant_color_name(crop_hsv)
                        result["pattern"] = get_design_texture(crop_gray)
        except Exception as e:
            # Log error internally but proceed with fallbacks
            result["warning"] = f"YOLO processing warning: {str(e)}"

    # Map YOLO class names to clean, buyer-friendly keywords
    obj = result["detected_object"].replace("_", " ").lower()
    
    # Map common YOLO classes to e-commerce friendly search terms
    replacements = {
        "cup": "mug", "bottle": "water bottle", "handbag": "bag",
        "tie": "necktie", "suitcase": "travel bag", "umbrella": "umbrella",
        "chair": "office chair", "bed": "bedding sheet", "book": "book",
        "sports ball": "ball", "tv": "television screen", "laptop": "laptop",
        "cell phone": "smartphone", "backpack": "backpack", "clock": "clock",
        "vase": "flower vase", "wine glass": "glass tumbler", "keyboard": "keyboard"
    }
    obj = replacements.get(obj, obj)

    col = result["color"]
    pat = result["pattern"]

    # Build descriptive query
    query_parts = []
    if col and col != "unknown":
        query_parts.append(col)
    if pat and pat != "solid" and pat != "unknown":
        query_parts.append(pat)
    query_parts.append(obj)

    result["query"] = " ".join(query_parts)
    result["success"] = True
    return result


if __name__ == "__main__":
    # Test script fallback
    if len(sys.argv) < 2:
        # Check stdin
        try:
            line = sys.stdin.readline().strip()
            if line:
                data = json.loads(line)
                image_path = data.get("image_path", "")
                res = analyze_image(image_path)
                print(json.dumps(res))
                sys.exit(0)
        except Exception as e:
            pass
        
        print(json.dumps({"success": False, "error": "No image path supplied"}))
        sys.exit(1)

    image_path = sys.argv[1]
    res = analyze_image(image_path)
    print(json.dumps(res))
