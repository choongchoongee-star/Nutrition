import requests
import sys
import os

def test_analyze(image_path):
    url = "http://localhost:8000/api/v1/analyze"
    
    if not os.path.exists(image_path):
        print(f"Error: File {image_path} not found.")
        return

    with open(image_path, "rb") as f:
        files = {"image": (os.path.basename(image_path), f, "image/jpeg")}
        print(f"Sending {image_path} to Gemini for analysis...")
        response = requests.post(url, files=files)

    if response.status_code == 200:
        print("\n--- Analysis Result ---")
        print(response.json())
    else:
        print(f"\nError: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_analysis.py <path_to_image>")
    else:
        test_analyze(sys.argv[1])
