from flask import Flask, request, render_template, jsonify
import requests
from flask_cors import CORS
import re
import json

app = Flask(__name__, template_folder="../frontend")  
app.secret_key = "9f78d6603d1a4f35808e3f3f1fa9d8c1"

CORS(app)

# ✅ Put your Gemini and OpenWeather API keys here
GEMINI_API_KEY ="AIzaSyDZTCC6wJyCIl1iyyVwo-77heVguAx3JIQ "
OPENWEATHER_API_KEY = "a6f38793fd5360f728d6b2e3de3e9a2a"

# ⚡ Simple in-memory cache
cache = {}

@app.route('/')
def home():
    return render_template('index.html')


@app.route("/place_info", methods=["POST"])
def place_info():
    data = request.get_json(force=True)
    place_name = data.get("place_name", "").title()

    if not place_name:
        return jsonify({"error": "Invalid place name"}), 400

    if place_name in cache:
        return jsonify(cache[place_name])



    prompt = (
    f"Give a very short description (2-3 lines) about {place_name}. "
    "List top 5 places to watch as names only (without descriptions). "
    "Also provide best time to visit (only months). "
    "Return JSON like:\n"
    "{\"name\": \"...\", \"description\": \"...\", \"places_to_watch\": [\"place1\", \"place2\", \"place3\", \"place4\", \"place5\"], \"best_time\": \"...\"}"
)



    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if response.status_code != 200:
            return jsonify({
                "error": "Error from Gemini API",
                "status": response.status_code,
                "response_body": response.text
            }), 500

        result = response.json()
        text = result["candidates"][0]["content"]["parts"][0]["text"]

        match = re.search(r'\{.*\}', text, re.S)
        if match:
            text = match.group(0)

        try:
            place_data = json.loads(text)
        except json.JSONDecodeError as e:
            return jsonify({"error": "Invalid JSON returned from Gemini", "details": str(e)}), 500

        required_fields = ["name", "description","best_time", "places_to_watch"]
        if not all(field in place_data for field in required_fields) or len(place_data["places_to_watch"]) != 5:
            return jsonify({"error": "Incomplete or invalid data received from Gemini"}), 500

        # ✅ Get Weather
        try:
            url_weather = f"http://api.openweathermap.org/data/2.5/weather?q={place_name}&appid={OPENWEATHER_API_KEY}&units=metric"
            weather_response = requests.get(url_weather, timeout=10)

            if weather_response.status_code == 200:
                weather_data = weather_response.json()
                place_data["weather"] = {
                    "temperature": weather_data["main"]["temp"],
                    "description": weather_data["weather"][0]["description"]
                }
            else:
                place_data["weather"] = None
        except Exception:
            place_data["weather"] = None

        # ✅ Get Images from Wikipedia
        place_data["places_images"] = []
        for place in place_data["places_to_watch"]:
            try:
                wiki_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={place}&format=json"
                wiki_response = requests.get(wiki_url, timeout=10).json()
                page_name = wiki_response[1][0] if wiki_response[1] else None
                if page_name:
                    page_url = f"https://en.wikipedia.org/w/api.php?action=query&titles={page_name}&prop=pageimages&format=json&pithumbsize=300"
                    page_data = requests.get(page_url, timeout=10).json()
                    page = list(page_data["query"]["pages"].values())[0]
                    image_url = page.get("thumbnail", {}).get("source", None)
                    place_data["places_images"].append(image_url)
                else:
                    place_data["places_images"].append(None)
            except Exception:
                place_data["places_images"].append(None)

        # ⚡ Save to cache
        cache[place_name] = place_data
        return jsonify(place_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/build_trip", methods=["POST"])
def build_trip():
    data = request.get_json(force=True)
    place_name = data.get("place_name", "").title()
    no_of_days = data.get("no_of_days", "")

    if not place_name or not no_of_days:
        return jsonify({"error": "Missing place_name or no_of_days"}), 400

    # ✅ Gemini Prompt for Trip Itinerary
    prompt = (
    f"You are a travel guide. The user wants to visit the place called '{place_name}'. "
    f"Generate a {no_of_days}-day travel itinerary specifically for {place_name}, a real destination. "
    "Avoid mentioning unrelated places. Only include tourist attractions, beaches, local food spots, and cultural locations from or near that place. "
    "Respond only in this JSON format:\n"
    "{\"itinerary\": [\"Day 1: ...\", \"Day 2: ...\", \"Day 3: ...\"]}"
)


    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if response.status_code != 200:
            return jsonify({
                "error": "Error from Gemini API",
                "status": response.status_code,
                "response_body": response.text
            }), 500

        result = response.json()
        text = result["candidates"][0]["content"]["parts"][0]["text"]

        match = re.search(r'\{.*\}', text, re.S)
        if match:
            text = match.group(0)

        try:
            trip_data = json.loads(text)
        except json.JSONDecodeError as e:
            return jsonify({"error": "Invalid JSON returned from Gemini for trip itinerary", "details": str(e)}), 500

        return jsonify(trip_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(host="127.0.0.1", port=5000, debug=True)

