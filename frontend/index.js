const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const chatMessages = document.getElementById("chat-messages");
const scrollArrow = document.getElementById("scroll-arrow");

let expectingDays = false;
let lastPlaceSearched = "";
function updateScrollArrowVisibility() {
  const isScrollable = chatMessages.scrollHeight > chatMessages.clientHeight;
  const isAtBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 10;

  if (isScrollable && !isAtBottom) {
    scrollArrow.classList.remove("hidden");
  } else {
    scrollArrow.classList.add("hidden");
  }
}


function appendMessage(content, sender) {
  const div = document.createElement("div");
  div.className = `chat-message ${sender}`;

  const messageDiv = document.createElement("div");
  messageDiv.className = "message-content";
  messageDiv.innerHTML = content;

  div.appendChild(messageDiv);
  chatMessages.appendChild(div);

  updateScrollArrowVisibility();

  // 👇 Scroll to this message if it's a user message
  if (sender === "user") {
    // Let the DOM render the new element first
    setTimeout(() => {
      div.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 10);
  }
}



function appendMessageAndScroll(content, sender) {
  appendMessage(content, sender);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendUserMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  appendMessage(message, "user");
  userInput.value = "";

  if (expectingDays) {
    handleTripDays(message);
    return;
  }

  lastPlaceSearched = message;

  // ✅ Add a placeholder bot message and keep a reference to it
  appendMessage("🔍 Fetching information about this place... please wait 🗺️", "bot");
  const loadingDiv = document.querySelector(".chat-message.bot:last-child .message-content");

  fetch("http://127.0.0.1:5000/place_info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_name: message })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        loadingDiv.innerHTML = data.error;
        return;
      }

      let reply = `
        <strong>📍 ${data.name}</strong><br/>
        ${data.description}<br/>
      `;
      if (data.weather && data.weather.temperature) {
        reply += `<br/>🌞 <strong>Weather:</strong> ${data.weather.temperature}°C, ${data.weather.description}<br/>`;
      }
      reply += `<br/>🌅 <strong>Best Time to Visit:</strong> ${data.best_time}<br/>`;

      if (data.places_to_watch && data.places_to_watch.length > 0) {
        reply += "<br/>👀 <strong>Places to Watch:</strong><ul class='places-list'>";
        for (const place of data.places_to_watch) {
          reply += `<li>${place}</li>`;
        }
        reply += "</ul>";
      }

      reply += `<br/>🏨 Need a place to stay?<br/>
<button class="booking-button" onclick="window.open('https://www.booking.com/searchresults.html?ss=${encodeURIComponent(data.name)}', '_blank')">
  Book Hotels in ${data.name}
</button>`;

      // ✅ Replace loading with actual content
      loadingDiv.innerHTML = reply;

      // ✅ Append images after description
      if (data.places_images && data.places_images.length > 0) {
        const imagesContainer = document.createElement("div");
        imagesContainer.className = "places-images";
        data.places_images.forEach(imgUrl => {
          if (imgUrl) {
            const img = document.createElement("img");
            img.src = imgUrl;
            img.alt = "Location image";
            img.className = "chat-image";
            imagesContainer.appendChild(img);
          }
        });
        chatMessages.appendChild(imagesContainer);
      }

      const askTickets = `
        <br/>Would you like to book tickets for your journey?<br/>
        <button class="option-button" data-choice="yes">Yes</button>
        <button class="option-button" data-choice="no">No</button>
      `;
      appendMessage(askTickets, "bot");
    })
    .catch(error => {
      console.error(error);
      loadingDiv.innerHTML = "❌ There was an error. Try again later.";
    });
}

function handleTripDays(days) {
  expectingDays = false;

  if (isNaN(days) || parseInt(days) <= 0) {
    appendMessageAndScroll("❌ Please enter a valid number of days.", "bot");
    return;
  }

  const no_of_days = parseInt(days);
  const placeName = lastPlaceSearched;

  // ✅ Show "planning..." message and create a loading div
  const loadingMessage = `📅 Thanks! Planning a ${no_of_days}-day trip…<br/>🧭 Fetching your trip details... please wait ✈️`;
  appendMessageAndScroll(loadingMessage, "bot");

  fetch("http://127.0.0.1:5000/build_trip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_name: placeName, no_of_days }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        appendMessageAndScroll("❌ Could not generate itinerary. Please try again.", "bot");
        console.error("Gemini itinerary error:", data.error);
        return;
      }

      if (!data.itinerary || !Array.isArray(data.itinerary)) {
        appendMessageAndScroll("❌ Invalid itinerary format returned from Gemini.", "bot");
        return;
      }

      const itineraryText = data.itinerary.map(item => `🗓️ ${item}`).join("<br/>");
      appendMessageAndScroll(itineraryText, "bot");

      // ✅ Ask for next destination
      appendMessageAndScroll("🎒 Your itinerary is ready! What's your next destination? ", "bot");
    })
    .catch(err => {
      console.error("Trip fetch failed:", err);
      appendMessageAndScroll("❌ Error while fetching itinerary.", "bot");
    });
}




sendButton.addEventListener("click", sendUserMessage);
userInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendUserMessage();
  }
});

chatMessages.addEventListener("click", e => {
  if (e.target.classList.contains("option-button")) {
    const choice = e.target.getAttribute("data-choice");
    if (choice === "yes") {
      const transportOptions = `
Book Your Travel:<br/>
<button class="booking-button" onclick="window.open('https://www.irctc.co.in/', '_blank')">🚂 Train</button>
<button class="booking-button" onclick="window.open('https://www.redbus.in/', '_blank')">🚌 Bus</button>
<button class="booking-button" onclick="window.open('https://www.makemytrip.com/flights/', '_blank')">✈️ Flight</button>
`;


      appendMessageAndScroll(transportOptions, "bot");
      askForPlan();
    } else if (choice === "no") {
      askForPlan();
    }
  }

  if (e.target.classList.contains("plan-option")) {
    const planChoice = e.target.getAttribute("data-plan");
    if (planChoice === "yes") {
      expectingDays = true;
      appendMessageAndScroll("Enter the number of days for your trip:", "bot");
    } else {
      appendMessageAndScroll("No problem! Whenever you're ready, just tell me your next destination. 🌍", "bot");
    }
  }
});

function askForPlan() {
  const planAsk = `
    <br/>Would you like to build a trip?<br/>
    <button class="plan-option" data-plan="yes">Yes</button>
    <button class="plan-option" data-plan="no">No</button>
  `;
  appendMessageAndScroll(planAsk, "bot");
}

chatMessages.addEventListener("scroll", () => {
  if (chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 10) {
    scrollArrow.classList.add("hidden");
  } else {
    scrollArrow.classList.remove("hidden");
  }
});

scrollArrow.addEventListener("click", () => {
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

window.onload = () => {
  appendMessage("Hi! I'm your Travel Buddy 🌍.<br/>What's your destination?", "bot");
};
