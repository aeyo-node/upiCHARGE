"use client";

import { useEffect, useState, useRef } from "react";
import Script from "next/script";
import { 
  Camera, 
  MapPin, 
  ShieldCheck, 
  CheckCircle2, 
  RotateCcw, 
  AlertCircle, 
  Play, 
  Square, 
  Loader2, 
  ArrowRight, 
  Wallet, 
  Zap, 
  Clock, 
  IndianRupee, 
  Smartphone, 
  User, 
  MessageSquare,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  ArrowDownCircle,
  Upload,
  Image
} from "lucide-react";

// API base is dynamically set inside the Home component state

export default function Home() {
  const apiBase = ""; // Force relative routing everywhere to use the Next.js reverse-proxy.

  // State management for screen transition:
  // 'home' | 'connector' | 'payment' | 'charging' | 'receipt' | 'support' | 'map'
  const [screen, setScreen] = useState("home");
  
  // App context states
  const [qrInput, setQrInput] = useState("");
  const [chargerId, setChargerId] = useState("");
  const [stationDetails, setStationDetails] = useState(null);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [prepaidAmount, setPrepaidAmount] = useState(200);
  const [customAmount, setCustomAmount] = useState("");
  const [customerMobile, setCustomerMobile] = useState("+918086477654");
  const [isDummyMode, setIsDummyMode] = useState(true);
  
  // Charging state feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorErrorMsg] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScanned, setLastScanned] = useState("");

  // Support Chat States
  const [chatUserId, setChatUserId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);

  // Charger Locator Map States
  const [nearbyChargers, setNearbyChargers] = useState([]);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [userLat, setUserLat] = useState(null);
  const [userLon, setUserLon] = useState(null);

  // Refs for Chat and Map DOM containers
  const chatEndRef = useRef(null);
  const mapRef = useRef(null);
  const leafletMapInstance = useRef(null);
  const scannerRef = useRef(null);
  const scannerInstance = useRef(null);
  const inactivePollsRef = useRef(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/payments/config");
        if (res.ok) {
          const config = await res.json();
          setIsDummyMode(config.payment_mode !== "live");
        }
      } catch (err) {
        console.error("Failed to fetch payment config:", err);
      }
    };
    fetchConfig();
  }, []);

  // Initialize unique Chat User ID on mount
  useEffect(() => {
    let uid = localStorage.getItem("upicharge_chat_user_id");
    if (!uid) {
      uid = "usr_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("upicharge_chat_user_id", uid);
    }
    setChatUserId(uid);
  }, []);

  // Poll support chat history when screen is "support"
  useEffect(() => {
    if (screen !== "support" || !chatUserId) return;

    const fetchChatHistory = async () => {
      try {
        const res = await fetch(`/api/support/history/${chatUserId}`);
        if (res.ok) {
          const data = await res.json();
          setChatMessages(data);
        }
      } catch (err) {
        console.error("Error polling chat history:", err);
      }
    };

    fetchChatHistory();
    const interval = setInterval(fetchChatHistory, 4000);
    return () => clearInterval(interval);
  }, [screen, chatUserId]);

  // Send message to backend support admin
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatSending || !chatUserId) return;
    
    const text = chatInput.trim();
    setChatInput("");
    setIsChatSending(true);
    
    // Optimistic UI update
    const optimisticMsg = {
      sender: "user",
      text: text,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, optimisticMsg]);
    
    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: chatUserId,
          text: text,
          user_name: `User ${chatUserId.slice(-4).toUpperCase()}`
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.chat && data.chat.messages) {
          setChatMessages(data.chat.messages);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setIsChatSending(false);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (screen === "support" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, screen]);

  // Request browser geolocation and fetch chargers within 30 km when on "map" tab
  useEffect(() => {
    if (screen !== "map") return;
    
    setIsMapLoading(true);
    setMapError("");

    const fetchNearby = async (lat, lon) => {
      try {
        const res = await fetch(`/api/charging/nearby?lat=${lat}&lon=${lon}`);
        if (res.ok) {
          const data = await res.json();
          setNearbyChargers(data.chargers || []);
        } else {
          setMapError("Failed to fetch nearby chargers.");
        }
      } catch (err) {
        console.error("Error fetching nearby chargers:", err);
        setMapError("Connection error while searching nearby chargers.");
      } finally {
        setIsMapLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setUserLat(lat);
          setUserLon(lon);
          fetchNearby(lat, lon);
        },
        (error) => {
          console.warn("Geolocation permission denied/timeout. Using default location near Kerala.", error);
          const lat = 8.51093;
          const lon = 76.90492;
          setUserLat(lat);
          setUserLon(lon);
          fetchNearby(lat, lon);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      console.warn("Geolocation not supported by this browser.");
      const lat = 8.51093;
      const lon = 76.90492;
      fetchNearby(lat, lon);
    }
  }, [screen]);

  // Load Leaflet dynamically and render markers on map
  useEffect(() => {
    if (screen !== "map" || isMapLoading || nearbyChargers.length === 0) return;

    let linkNode = null;
    let scriptNode = null;

    const initMap = () => {
      if (!window.L || !mapRef.current) return;

      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }

      const L = window.L;
      const lat = userLat || 8.51093;
      const lon = userLon || 76.90492;
      
      const map = L.map(mapRef.current, {
        zoomControl: false
      }).setView([lat, lon], 12);
      
      leafletMapInstance.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Custom pulsing dot for user location
      if (userLat && userLon) {
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `
            <div class="relative flex items-center justify-center w-6 h-6">
              <div class="absolute w-6 h-6 bg-[#007aff]/20 rounded-full animate-ping"></div>
              <div class="absolute w-4 h-4 bg-[#007aff] rounded-full border-2 border-white shadow-md"></div>
            </div>
          `,
          iconSize: [24, 24]
        });
        
        L.marker([userLat, userLon], { icon: userIcon })
          .addTo(map)
          .bindPopup("<div class='font-bold text-xs text-[#1d1d1f]'>You are here</div>")
          .openPopup();
      }

      // Plot all nearby chargers with custom pointers
      nearbyChargers.forEach(cp => {
        const geo = cp.geoLocation;
        if (geo && geo.type === "Point" && geo.coordinates && geo.coordinates.length === 2) {
          const [chargerLon, chargerLat] = geo.coordinates;
          
          const chargerIcon = L.divIcon({
            className: 'custom-charger-marker',
            html: `
              <div class="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-[#e07a2c]/30 shadow-md text-[#e07a2c] hover:scale-110 active:scale-95 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
                </svg>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });

          const marker = L.marker([chargerLat, chargerLon], { icon: chargerIcon }).addTo(map);
          
          const popupContent = `
            <div class="p-2 text-[#1d1d1f] font-sans space-y-1 w-44">
              <div class="font-extrabold text-xs leading-snug">${cp.chargerName}</div>
              <div class="text-[10px] text-[#86868b] leading-tight">${cp.locationName}</div>
              <div class="flex items-center space-x-1.5 mt-1">
                <span class="inline-block w-2 h-2 rounded-full bg-[#34c759] animate-pulse"></span>
                <span class="text-[10px] text-[#34c759] font-bold">${cp.distance ? cp.distance.toFixed(1) + ' km away' : 'Nearby'}</span>
              </div>
              <button 
                onclick="window.selectChargerFromMap('${cp.identity}')"
                class="mt-2 w-full bg-[#007aff] hover:bg-opacity-95 text-white font-bold py-1.5 px-3 rounded-xl text-[10px] cursor-pointer active:scale-95 transition border-none shadow-sm outline-none"
              >
                Select Charger
              </button>
            </div>
          `;
          
          marker.bindPopup(popupContent, { closeButton: false, offset: [0, -24] });
        }
      });
    };

    window.selectChargerFromMap = (chargerId) => {
      setQrInput(chargerId);
      handleVerify(chargerId);
    };

    if (window.L) {
      initMap();
    } else {
      // Inject Leaflet CSS
      linkNode = document.createElement("link");
      linkNode.rel = "stylesheet";
      linkNode.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(linkNode);

      // Inject Leaflet JS
      scriptNode = document.createElement("script");
      scriptNode.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      scriptNode.async = true;
      scriptNode.onload = () => {
        initMap();
      };
      document.head.appendChild(scriptNode);
    }

    return () => {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }
    };
  }, [screen, nearbyChargers, isMapLoading]);
  // Logic Functions
  function triggerBrowserNotification(title, body) {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, { body });
        } catch (e) {
          console.error("Failed to trigger Notification:", e);
        }
      }
    }
  }

  function handleCopyTx(txId) {
    if (!txId) return;
    navigator.clipboard.writeText(txId);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  async function handleVerify(inputCode) {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    
    setErrorErrorMsg("");
    setLoading(true);
    
    console.log("[handleVerify] Raw input:", inputCode);
    
    await stopScanner();

    let cleanCode = inputCode || qrInput;
    if (cleanCode) {
      cleanCode = cleanCode.trim();
      setLastScanned(cleanCode);
    }

    try {
      const verifyUrl = `${apiBase}/api/charging/verify-station/${encodeURIComponent(cleanCode)}`;
      console.log("[handleVerify] Fetching:", verifyUrl);
      
      const res = await fetch(verifyUrl);
      if (!res.ok) {
        let errorText = "Charger verification failed.";
        try {
          const errData = await res.json();
          errorText = errData.detail || errorText;
        } catch (e) {}
        throw new Error(errorText);
      }

      const data = await res.json();
      console.log("[handleVerify] Station data received:", data);
      setStationDetails(data);
      setChargerId(data.charger_id);
      
      if (data.connectors && data.connectors.length > 0) {
        setSelectedConnector(data.connectors[0]);
      }
      
      setScreen("connector");
    } catch (err) {
      console.error("[handleVerify] Error details:", err);
      let msg = err.message || "Could not connect to charger.";
      if (msg === "Failed to fetch") {
        msg = "Failed to fetch: Connection error between browser and server.";
      }
      setErrorErrorMsg(msg);
      verifyingRef.current = false;
      await startScanner();
    } finally {
      setLoading(false);
    }
  }

  async function startScanner() {
    if (typeof window === "undefined") return;
    if (scannerInstance.current) {
      await stopScanner();
    }
    
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader-target");
      scannerInstance.current = scanner;
      
      const config = { fps: 10 };
      
      try {
        await scanner.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            await handleVerify(decodedText);
          },
          () => {}
        );
        setCameraActive(true);
      } catch (innerErr) {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          let cameraId = devices[0].id;
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes("back") || 
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
          );
          if (backCam) cameraId = backCam.id;
          
          await scanner.start(
            cameraId,
            config,
            async (decodedText) => {
              await handleVerify(decodedText);
            },
            () => {}
          );
          setCameraActive(true);
        } else {
          throw new Error("No cameras found.");
        }
      }
    } catch (err) {
      console.error("[Scanner] Start failed:", err);
      setCameraActive(false);
      if (err.toString().includes("NotAllowedError") || err.toString().includes("Permission")) {
        setErrorErrorMsg("Camera permission denied.");
      } else {
        setErrorErrorMsg("Camera error: " + (err.message || "Unknown error"));
      }
    }
  }

  async function stopScanner() {
    setCameraActive(false);
    if (scannerInstance.current) {
      try {
        if (scannerInstance.current.isScanning) {
          await scannerInstance.current.stop();
        }
      } catch (err) {
        console.warn("[Scanner] Stop error:", err);
      }
      scannerInstance.current = null;
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setErrorErrorMsg("");
    setLoading(true);
    
    try {
      await stopScanner();
      const { Html5Qrcode } = await import("html5-qrcode");
      const fileScanner = new Html5Qrcode("qr-file-fallback-target");
      const decodedText = await fileScanner.scanFile(file, false);
      e.target.value = "";
      await handleVerify(decodedText);
    } catch (err) {
      setErrorErrorMsg("Could not find a valid QR code in that image.");
      await startScanner();
    } finally {
      setLoading(false);
    }
  }

  async function handleStopCharging() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/charging/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charger_id: chargerId,
          customer_mobile: activeSession?.customer_mobile || customerMobile || "9999999999",
          prepaid_amount: activeSession?.prepaid_amount || 0
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Stop API returned error.");
      }

      const data = await res.json();
      setReceipt(data.metrics);
      
      triggerBrowserNotification(
        "🔌 Charging Stopped!",
        `Usage: ${(data.metrics.energy_kwh || 0).toFixed(2)} kWh\nAmount Charged: ₹${(data.metrics.actual_cost || 0).toFixed(2)}`
      );

      localStorage.removeItem("active_charge_session");
      setActiveSession(null);
      setScreen("receipt");
    } catch (err) {
      setErrorErrorMsg(err.message || "Remote stop failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleAutoStop() {
    localStorage.removeItem("active_charge_session");
    handleStopCharging();
  }

  function handleReset() {
    setScreen("home");
    setQrInput("");
    setChargerId("");
    setStationDetails(null);
    setSelectedConnector(null);
    setReceipt(null);
    setCustomAmount("");
    setErrorErrorMsg("");
    verifyingRef.current = false;
  }

  function handleProceedToPayment() {
    setErrorErrorMsg("");
    setScreen("payment");
  }

  async function handleStartCharging() {
    setLoading(true);
    setErrorErrorMsg("");

    const finalPrepaid = customAmount ? parseFloat(customAmount) : prepaidAmount;
    const finalMobile = customerMobile ? customerMobile : "9999999999";

    try {
      const res = await fetch(`${apiBase}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charger_id: chargerId,
          connector_id: selectedConnector.connector_id,
          customer_mobile: finalMobile,
          amount: finalPrepaid
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create payment order.");
      }

      const orderData = await res.json();

      if (orderData.dummy_mode === true) {
        const startRes = await fetch(`${apiBase}/api/charging/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            charger_id: chargerId,
            connector_id: selectedConnector.connector_id,
            customer_mobile: finalMobile,
            prepaid_amount: finalPrepaid
          })
        });

        if (!startRes.ok) {
          const errData = await startRes.json();
          throw new Error(errData.detail || "Failed to start charger.");
        }

        const initialSession = {
          charger_id: chargerId,
          connector_id: selectedConnector.connector_id,
          customer_mobile: finalMobile,
          prepaid_amount: finalPrepaid,
          energy_kwh: 0,
          cost_rs: 0,
          elapsed_seconds: 0
        };

        localStorage.setItem("active_charge_session", JSON.stringify(initialSession));
        setActiveSession(initialSession);
        setScreen("charging");
        
        triggerBrowserNotification("⚡ Charging Started!", `Prepaid Limit: ₹${finalPrepaid}`);
      } else {
        if (typeof window === "undefined" || !window.Razorpay) {
          throw new Error("Razorpay SDK not loaded.");
        }

        const options = {
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency,
          name: orderData.name,
          description: orderData.description,
          order_id: orderData.order_id,
          handler: function (response) {
            const initialSession = {
              charger_id: chargerId,
              connector_id: selectedConnector.connector_id,
              customer_mobile: finalMobile,
              prepaid_amount: finalPrepaid,
              energy_kwh: 0,
              cost_rs: 0,
              elapsed_seconds: 0
            };
            localStorage.setItem("active_charge_session", JSON.stringify(initialSession));
            setActiveSession(initialSession);
            setScreen("charging");
            triggerBrowserNotification("⚡ Charging Started!", `Prepaid Limit: ₹${finalPrepaid}`);
          },
          prefill: {
            contact: finalMobile,
            email: "aeyo.node@gmail.com",
            method: 'upi'
          },
          theme: { color: "#e07a2c" }
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (response) {
          setErrorErrorMsg(response.error.description || "Payment failed.");
        });
        rzp.open();
      }
    } catch (err) {
      setErrorErrorMsg(err.message || "Checkout failed.");
      setScreen("connector");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadInvoice(receiptData) {
    const invoiceHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tax Invoice - upiCHARGE</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            line-height: 1.5;
            background-color: #f6f8fa;
            margin: 0;
            padding: 20px;
        }
        .invoice-card {
            max-width: 600px;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px;
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            border: 1px solid #e1e4e8;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #f1f2f4;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }
        .logo {
            font-weight: 800;
            font-size: 24px;
            color: #111;
        }
        .logo span {
            color: #e07a2c;
        }
        .badge {
            background-color: #e2f9eb;
            color: #219653;
            font-size: 11px;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 50px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #828282;
            margin-bottom: 12px;
        }
        .grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }
        .info-block label {
            display: block;
            font-size: 11px;
            color: #828282;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .info-block div {
            font-size: 14px;
            font-weight: 700;
            color: #333;
        }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            margin-bottom: 25px;
        }
        .table th {
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #828282;
            padding: 8px 12px;
            border-bottom: 1px solid #e1e4e8;
        }
        .table td {
            padding: 12px;
            font-size: 14px;
            border-bottom: 1px solid #f1f2f4;
        }
        .table td.amount {
            text-align: right;
            font-weight: 600;
        }
        .table th.amount {
            text-align: right;
        }
        .summary {
            margin-left: auto;
            width: 50%;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
        }
        .summary-row.total {
            font-weight: 800;
            font-size: 18px;
            border-top: 2px solid #333;
            padding-top: 12px;
            margin-top: 8px;
            color: #111;
        }
        .refund-section {
            background-color: #f2f9ff;
            border-left: 4px solid #e07a2c;
            border-radius: 8px;
            padding: 15px;
            margin-top: 30px;
            margin-bottom: 20px;
            font-size: 13px;
        }
        .refund-section h4 {
            margin: 0 0 5px 0;
            color: #e07a2c;
            font-weight: 700;
        }
        .refund-section p {
            margin: 0;
            color: #555;
        }
        .footer {
            text-align: center;
            font-size: 11px;
            color: #828282;
            margin-top: 40px;
            border-top: 1px solid #e1e4e8;
            padding-top: 20px;
        }
        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
            }
            .invoice-card {
                border: none;
                box-shadow: none;
                padding: 0;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-card">
        <div class="header">
            <div class="logo">upi<span>CHARGE</span></div>
            <div class="badge">Paid</div>
        </div>
        
        <div class="grid">
            <div class="info-block">
                <label>Tax Invoice No.</label>
                <div>INV-${receiptData.transaction_id || "TXN_93818"}</div>
            </div>
            <div class="info-block" style="text-align: right;">
                <label>Invoice Date</label>
                <div>${receiptData.session_date_formatted || "03 Jun 2026"}</div>
            </div>
        </div>
        
        <div style="border-top: 1px solid #f1f2f4; padding-top: 20px; margin-bottom: 20px;">
            <div class="section-title">Charging Session Details</div>
            <div class="grid">
                <div class="info-block">
                    <label>Station Name</label>
                    <div>${receiptData.location_name || "OCPI Test Location - PROD"}</div>
                </div>
                <div class="info-block" style="text-align: right;">
                    <label>Charger Device</label>
                    <div>${receiptData.charger_name || "test device"}</div>
                </div>
                <div class="info-block">
                    <label>Session Duration</label>
                    <div>Start Time: ${receiptData.start_time_formatted || "09:02 PM"}<br>End Time: ${receiptData.end_time_formatted || "09:07 PM"}</div>
                </div>
                <div class="info-block" style="text-align: right;">
                    <label>Telemetry Details</label>
                    <div>Vehicle: ${receiptData.vehicle_model || "--"}<br>Reason: ${receiptData.stop_reason || "Stopped Remotely"}</div>
                </div>
            </div>
        </div>

        <div class="section-title">Billing Breakdown</div>
        <table class="table">
            <thead>
                <tr>
                    <th>Description</th>
                    <th style="text-align: center;">Energy Usage</th>
                    <th class="amount">Taxable Value</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>Energy Consumption Fee</strong><br>
                        <span style="font-size: 11px; color: #828282;">Charge consumption rate tariff fee</span>
                    </td>
                    <td style="text-align: center;">${receiptData.energy_kwh?.toFixed(2)} kWh</td>
                    <td class="amount">₹${receiptData.energy_usage_fee?.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>
                        <strong>Base Service Fee</strong><br>
                        <span style="font-size: 11px; color: #828282;">Session connectivity processing charge</span>
                    </td>
                    <td style="text-align: center;">—</td>
                    <td class="amount">₹${receiptData.service_fee?.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div class="summary">
            <div class="summary-row">
                <span>Taxable Amount</span>
                <span>₹${(receiptData.service_fee + receiptData.energy_usage_fee).toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <span>Tax (GST ${receiptData.tax_percentage}%)</span>
                <span>₹${receiptData.tax_amount?.toFixed(2)}</span>
            </div>
            <div class="summary-row total">
                <span>Total Amount</span>
                <span>₹${receiptData.actual_cost?.toFixed(2)}</span>
            </div>
        </div>

        <div class="refund-section">
            <h4>Prepayment & Refund Breakdown</h4>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Prepaid Authorized:</span>
                <strong>₹${receiptData.prepaid_amount?.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Actual Session Cost:</span>
                <strong>₹${receiptData.actual_cost?.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(224, 122, 44, 0.15); padding-top: 5px; font-weight: 700;">
                <span style="color: #219653;">Refund Dispatched:</span>
                <span style="color: #219653;">₹${receiptData.refund_amount?.toFixed(2)}</span>
            </div>
            <p style="margin-top: 10px; font-size: 11px; color: #666;">
                The excess refund was initiated instantly back to your UPI source ID. Please verify with your UPI handle/banking app statement.
            </p>
        </div>

        <div class="footer">
            <p>Thank you for charging with upiCHARGE.com</p>
            <p style="font-size: 10px; color: #bdbdbd; margin-top: 5px;">This is a system generated tax invoice. No signature required.</p>
        </div>
    </div>
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        }
    </script>
</body>
</html>
    `;
    
    const blob = new Blob([invoiceHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_${receiptData.transaction_id || 'TXN_93818'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const w = window.open();
    if (w) {
        w.document.open();
        w.document.write(invoiceHtml);
        w.document.close();
    }
  }

  // Detect mobile viewport and request notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobileDevice(mobile);

      // Request notification permission
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Restore charging state on load (Session Persistence!)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCustomerMobile("+918086477654");
    }
    const savedSession = localStorage.getItem("active_charge_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setActiveSession(parsed);
        setChargerId(parsed.charger_id);
        setCustomerMobile(parsed.customer_mobile || "+918086477654");
        setPrepaidAmount(parsed.prepaid_amount);
        setScreen("charging");
      } catch (e) {
        localStorage.removeItem("active_charge_session");
      }
    }
  }, []);

  // Set up background status polling when in 'charging' screen
  useEffect(() => {
    let interval = null;
    
    if (screen === "charging" && activeSession) {
      const pollStatus = async () => {
        try {
          const res = await fetch(`${apiBase}/api/charging/status/${activeSession.charger_id}`);
          if (!res.ok) return;
          const data = await res.json();
          
          if (data.active === false) {
            // Charging stopped at backend (battery full / limit reached / stopped externally)
            // We implement a grace period of 5 polls (15 seconds) to let hardware register in the console active transaction scraper.
            inactivePollsRef.current++;
            console.log(`Polling reported inactive status. Grace period active (poll ${inactivePollsRef.current}/5)...`);
            if (inactivePollsRef.current > 5) {
              handleAutoStop();
            }
          } else {
            inactivePollsRef.current = 0; // Reset on any successful active poll!
            setActiveSession(prev => ({
              ...prev,
              energy_kwh: data.energy_kwh,
              cost_rs: data.cost_rs,
              elapsed_seconds: data.elapsed_seconds
            }));
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      pollStatus();
      interval = setInterval(pollStatus, 3000); // Poll every 3 seconds
    } else {
      inactivePollsRef.current = 0; // Reset when not in charging screen
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [screen, activeSession]);

  // Clean shutdown of camera when leaving home screen
  // Automatically manage the scanner life cycle: start on home, and stop when leaving
  useEffect(() => {
    if (screen === "home") {
      verifyingRef.current = false; // Reset lock whenever entering home screen!
      startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [screen]);


  return (
    <main className="min-h-screen flex flex-col items-center justify-start p-4 max-w-md mx-auto relative pb-24">
      {/* Header Bar */}
      <header className="w-full flex items-center justify-between py-6 border-b border-black/5 mb-6">
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 bg-apple-accent rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-apple-accent/30">
            uC
          </div>
          <span className="font-semibold text-lg tracking-tight text-[#1d1d1f]">upiCHARGE<span className="text-apple-accent">.com</span></span>
        </div>
        <div className="flex items-center space-x-1 glass py-1 px-3 rounded-full text-[11px] text-apple-emerald font-medium tracking-wide border-black/5">
          <span className="h-1.5 w-1.5 rounded-full bg-apple-emerald animate-pulse-slow mr-1" />
          Live Connected
        </div>
      </header>

      {/* ERROR BAN ROOM */}
      {errorMsg && (
        <div className="w-full glass border-l-4 border-l-apple-rose p-4 rounded-2xl mb-6 flex items-start space-x-3 text-sm animate-pulse-slow border-black/5">
          <AlertCircle className="h-5 w-5 text-apple-rose flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-apple-rose">Error occurred:</span>
            <p className="text-black/80 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 1: HOME (SCAN OR MANUAL) ==================== */}
      {screen === "home" && (
        <div className="w-full flex flex-col items-center space-y-6 animate-fadeIn">
          <div className="text-center space-y-2 mt-4">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-b from-[#1d1d1f] to-[#424245] bg-clip-text text-transparent">
              Tap & Charge
            </h1>
            <p className="text-sm text-[#86868b] font-light px-6">
              Skip the mobile apps, wallets, and RFIDs. Scan and start instantly via UPI.
            </p>
          </div>

          {/* Universal Camera Scanner View */}
          <div className="w-full flex flex-col items-center">
            <div className="w-full aspect-square relative rounded-[40px] overflow-hidden border border-black/10 shadow-xl glass-premium mb-4 flex items-center justify-center">
              {/* Camera feed target */}
              <div id="qr-reader-target" className="absolute inset-0 w-full h-full opacity-90" />
              
              {/* Hidden target for file-based scanner to prevent conflicts with camera */}
              <div id="qr-file-fallback-target" className="hidden" style={{ display: 'none' }} />
              
              {/* Simulated scanner overlay (corners & scanner line) */}
              <div className="absolute inset-0 border-[3px] border-apple-accent/40 rounded-[40px] pointer-events-none flex flex-col justify-between p-12 z-20">
                <div className="flex justify-between">
                  <span className="h-8 w-8 border-t-[4px] border-l-[4px] border-apple-accent rounded-tl-xl" />
                  <span className="h-8 w-8 border-t-[4px] border-r-[4px] border-apple-accent rounded-tr-xl" />
                </div>
                {/* Laser line effect */}
                <div className="h-[2px] w-full bg-apple-accent shadow-[0_0_15px_#2f80ed] animate-pulse" />
                <div className="flex justify-between">
                  <span className="h-8 w-8 border-b-[4px] border-l-[4px] border-apple-accent rounded-bl-xl" />
                  <span className="h-8 w-8 border-b-[4px] border-r-[4px] border-apple-accent rounded-br-xl" />
                </div>
              </div>

              {/* Bouncing Placeholder Camera Icon & Instructions (Shown ONLY when camera stream is loading/inactive) */}
              {!cameraActive && (
                <div className="text-center z-10 p-6 flex flex-col items-center text-black/40 animate-fadeIn">
                  <Camera className="h-10 w-10 mb-2 animate-bounce text-apple-accent" />
                  <span className="text-xs tracking-wider uppercase font-medium">Initializing camera stream...</span>
                  <p className="text-[11px] text-[#86868b]/60 mt-1 max-w-[200px] leading-relaxed">
                    Please grant camera permissions when prompted to start scanning instantly.
                  </p>
                </div>
              )}

              {/* Sleek overlay badge shown when the camera is actively scanning */}
              {cameraActive && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-2 z-30">
                  <div className="bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-black/5 flex items-center space-x-2 text-[#1d1d1f] text-xs font-semibold tracking-wide shadow-lg animate-fadeIn">
                    <span className="h-2 w-2 rounded-full bg-apple-accent animate-ping" />
                    <span>Align QR code to scan</span>
                  </div>
                  {lastScanned && (
                    <div className="bg-black/80 text-white/90 text-[10px] px-3 py-1 rounded-full backdrop-blur-sm animate-fadeIn">
                      Last seen: {lastScanned}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Action buttons under scanner */}
            <div className="w-full flex items-center justify-center space-x-3 mt-3 mb-1">
              <button 
                onClick={startScanner}
                className="text-xs font-semibold text-[#1d1d1f] flex items-center glass py-2.5 px-4 rounded-full hover:bg-black/5 border-black/5 transition active:scale-95 shadow-md"
                title="Restart the live camera feed"
              >
                <RefreshCw className="h-3 w-3 mr-1.5 text-apple-accent" /> Restart Camera
              </button>

              <label 
                className="text-xs font-semibold text-apple-accent flex items-center glass py-2.5 px-4 rounded-full cursor-pointer hover:bg-black/5 border-black/5 transition active:scale-95 shadow-md"
                title="Upload or snap a photo of a QR code from your gallery/camera"
              >
                <Upload className="h-3 w-3 mr-1.5 text-apple-accent" /> Upload QR / Photo
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {/* Manual Charger ID Input fallback */}
          <div className="w-full glass rounded-3xl p-6 space-y-4 border-black/5">
            <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-[#86868b] uppercase">
              <span>OR enter Charger ID</span>
              <span className="text-[10px] text-black/30 lowercase">(e.g. CM-CMOD0135-VLEM)</span>
            </div>
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="Enter ID manually (e.g. CMOD0135)" 
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
              />
            </div>

            <button 
              onClick={() => handleVerify()}
              disabled={loading || !qrInput}
              className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-semibold py-4 rounded-2xl shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <span>Verify Charger Connection</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 2: CONNECTOR / GUN SELECTION & PREPAID AMOUNT ==================== */}
      {screen === "connector" && stationDetails && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* Station card details */}
          <div className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-black/5">
            <div className="absolute top-0 right-0 h-24 w-24 bg-apple-accent/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start space-x-4">
              <div className="h-12 w-12 bg-apple-accent/10 border border-apple-accent/20 rounded-2xl flex items-center justify-center text-apple-accent shadow-inner">
                <MapPin className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-apple-accent uppercase tracking-widest font-bold">EV Charging Point</span>
                <h2 className="font-bold text-xl text-[#1d1d1f] tracking-tight">{stationDetails.charger_name}</h2>
                <p className="text-xs text-[#86868b] font-light leading-relaxed">{stationDetails.location_name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 border-t border-black/5 pt-4 text-xs text-[#86868b]">
              <ShieldCheck className="h-4 w-4 text-apple-emerald" />
              <span>Verified charger model. Real-time controls linked.</span>
            </div>
          </div>

          {/* Connectors / Gun list selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b] px-1">Select Connector (Gun)</h3>
            <div className="space-y-2">
              {stationDetails.connectors?.map((con) => {
                const isAvailable = con.status === "Available" || con.status === "Preparing";
                const isSelected = selectedConnector?.connector_id === con.connector_id;
                
                return (
                  <div 
                    key={con.connector_id}
                    onClick={() => isAvailable && setSelectedConnector(con)}
                    className={`w-full p-5 rounded-3xl cursor-pointer transition flex items-center justify-between border ${
                      isSelected 
                        ? "border-apple-accent bg-apple-accent/10 shadow-lg shadow-apple-accent/5" 
                        : "border-black/5 glass hover:bg-black/5"
                    } ${!isAvailable && "opacity-40 cursor-not-allowed"}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? "bg-apple-accent text-white" : "bg-black/5 text-[#1d1d1f]/70"
                      }`}>
                        {con.connector_id}
                      </div>
                      <div>
                        <div className="font-semibold text-sm tracking-wide text-[#1d1d1f]">{con.gun_label}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">{con.type} • {con.max_power_kw} kW</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`h-2 w-2 rounded-full ${
                        con.status === "Available" ? "bg-apple-emerald animate-pulse-slow" : "bg-apple-amber"
                      }`} />
                      <span className="text-[11px] font-semibold text-[#1d1d1f]/95">{con.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Combined Prepaid Section - displays instantly when a connector is selected */}
          {selectedConnector && (
            <div className="space-y-6 animate-fadeIn">
              {/* Prepaid selection section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b] px-1">Select Prepaid Amount</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[100, 200, 500].map((amt) => {
                    const isSelected = prepaidAmount === amt && !customAmount;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setPrepaidAmount(amt);
                          setCustomAmount("");
                        }}
                        className={`py-4 rounded-2xl font-bold border transition text-sm ${
                          isSelected 
                            ? "border-apple-accent bg-apple-accent/10 text-apple-accent" 
                            : "border-black/5 glass text-[#1d1d1f] hover:bg-black/5"
                        }`}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Field */}
                <div className="glass rounded-3xl p-5 space-y-3 border-black/5">
                  <span className="text-xs font-bold text-[#86868b] uppercase">Or Custom Prepaid Amount (Rs.)</span>
                  <input 
                    type="number" 
                    placeholder="Enter custom amount (e.g. 350)" 
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                  />
                </div>
              </div>

              {/* Secure Payment Trigger */}
              <div className="glass rounded-3xl p-6 space-y-4 border-black/5">
                <div className="flex items-center justify-between pb-3 border-b border-black/5 text-xs text-[#86868b]">
                  <span>Prepaid Selected:</span>
                  <span className="font-bold text-[#1d1d1f] text-lg">₹{customAmount ? customAmount : prepaidAmount}</span>
                </div>

                <div className="text-center py-2 space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#86868b]">Supported Gateways (UPI Intent)</span>
                  <div className="flex justify-center space-x-6 text-black/30 text-xs font-bold">
                    <span>GPay</span>
                    <span>PhonePe</span>
                    <span>Paytm</span>
                    <span>BHIM</span>
                  </div>
                </div>

                {/* Checkout / Payment CTA Button */}
                <button 
                  onClick={handleStartCharging}
                  disabled={loading}
                  className={`w-full font-bold py-4 rounded-2xl shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm ${
                    isDummyMode 
                      ? "bg-apple-emerald text-black shadow-apple-emerald/20 glow-emerald" 
                      : "bg-[#e07a2c] text-white shadow-orange-500/20"
                  }`}
                >
                  {loading ? (
                    <Loader2 className={`h-5 w-5 animate-spin ${isDummyMode ? "text-black" : "text-white"}`} />
                  ) : (
                    <>
                      <Sparkles className={`h-4 w-4 ${isDummyMode ? "text-black" : "text-white"}`} />
                      <span>{isDummyMode ? "Simulate Payment & Start Charging" : "Pay & Start Charging"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SCREEN 4: ACTIVE CHARGING DASHBOARD ==================== */}
      {screen === "charging" && activeSession && (
        <div className="w-full space-y-8 animate-fadeIn">
          {/* Animated Big Circular Progress Metric */}
          <div className="w-full flex flex-col items-center justify-center mt-6">
            <div className="relative h-64 w-64 rounded-full flex items-center justify-center border border-black/5 bg-gradient-to-b from-black/[0.02] to-transparent shadow-xl p-6">
              
              {/* Outer Pulse glow effect */}
              <div className="absolute inset-2 border-2 border-dashed border-apple-emerald/25 rounded-full animate-spin-slow" />
              <div className="absolute inset-0 rounded-full bg-apple-emerald/5 blur-2xl pointer-events-none" />

              {/* Central Text Panel */}
              <div className="text-center space-y-1 z-10">
                <span className="text-[10px] tracking-widest uppercase font-bold text-apple-emerald animate-pulse-slow">Charging active</span>
                
                {/* Big Units metric */}
                <div className="flex items-baseline justify-center">
                  <span className="text-5xl font-extrabold tracking-tight text-[#1d1d1f]">
                    {activeSession.energy_kwh || "0.00"}
                  </span>
                  <span className="text-sm font-semibold text-[#86868b] ml-1">kWh</span>
                </div>

                <div className="h-[1px] w-12 bg-black/10 mx-auto my-2" />

                {/* Running Cost */}
                <div className="flex items-center justify-center space-x-1 text-sm font-semibold text-[#1d1d1f]/90">
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span>{activeSession.cost_rs || "0.00"} spent so far</span>
                </div>
              </div>
            </div>
          </div>

          {/* Running Dashboard details lists */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass rounded-3xl p-5 space-y-1 flex flex-col justify-center border-black/5">
              <div className="flex items-center space-x-1.5 text-xs text-[#86868b] font-medium">
                <Clock className="h-4 w-4 text-apple-accent" />
                <span>Elapsed Duration</span>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f] mt-1">
                {formatTime(activeSession.elapsed_seconds || 0)}
              </span>
            </div>

            <div className="glass rounded-3xl p-5 space-y-1 flex flex-col justify-center border-black/5">
              <div className="flex items-center space-x-1.5 text-xs text-[#86868b] font-medium">
                <Wallet className="h-4 w-4 text-apple-emerald" />
                <span>Prepaid Limit</span>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f] mt-1">
                ₹{activeSession.prepaid_amount}
              </span>
            </div>
          </div>

          {/* Stop Mechanism Sliding Slider Trigger */}
          <div className="glass rounded-3xl p-6 space-y-5 border-black/5">
            <div className="flex items-center space-x-2 text-xs text-[#86868b] leading-relaxed font-light">
              <Zap className="h-4 w-4 text-apple-emerald" />
              <span>Power Delivery active on Connector {activeSession.connector_id}.</span>
            </div>

            {/* Tap to Stop Charging Control */}
            <button 
              onClick={handleStopCharging}
              disabled={loading}
              className="w-full bg-apple-rose text-white font-bold py-4 rounded-2xl shadow-lg shadow-apple-rose/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Square className="h-4 w-4 fill-white" />
                  <span>Stop Charging & Initiate Refund</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 5: DIGITAL RECEIPT CARD ==================== */}
      {screen === "receipt" && receipt && (
        <div className="w-full space-y-6 animate-fadeIn flex flex-col">
          {/* Top Bar with circular back button */}
          <div className="flex items-center w-full justify-between mb-2">
            <button 
              onClick={handleReset}
              className="h-10 w-10 bg-black/5 border border-black/10 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition active:scale-95 shadow-md"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-[11px] uppercase font-bold tracking-widest text-apple-emerald bg-apple-emerald/10 border border-apple-emerald/20 px-3 py-1 rounded-full flex items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-apple-emerald animate-pulse-slow mr-1.5" />
              Completed
            </span>
          </div>

          {/* Date stamp header */}
          <div className="text-left w-full mb-1">
            <span className="text-sm font-semibold text-[#86868b] tracking-wide">
              {receipt.session_date_formatted || "03 Jun 2026, 09:02 PM"}
            </span>
          </div>

          {/* Location Name Card */}
          <div className="w-full glass rounded-[24px] p-5 border border-black/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-16 w-16 bg-apple-accent/5 rounded-full blur-xl pointer-events-none" />
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">Location Name</span>
                <span className="font-extrabold text-base text-[#1d1d1f] tracking-tight mt-0.5 block leading-tight">
                  {receipt.location_name || "OCPI Test Location - PROD"}
                </span>
              </div>
              <div className="pt-2 border-t border-black/5">
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">Charger Name</span>
                <span className="font-bold text-sm text-[#1d1d1f] tracking-tight mt-0.5 block">
                  {receipt.charger_name || "test device"}
                </span>
              </div>
            </div>
          </div>

          {/* Three-column Fee Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {/* Energy Usage Fee */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Energy Usage Fee
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.energy_usage_fee || 0.00).toFixed(2)}
              </span>
            </div>

            {/* Service Fee */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Service Fee
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.service_fee || 0.00).toFixed(2)}
              </span>
            </div>

            {/* Tax */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Tax ({receipt.tax_percentage || 18.0}%)
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.tax_amount || 0.00).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Total Amount Card */}
          <div className="w-full glass rounded-[20px] p-5 border border-black/5 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-apple-accent/5 rounded-full blur-2xl pointer-events-none" />
            <span className="text-[10px] font-extrabold text-[#86868b] uppercase tracking-widest block">
              Total Amount
            </span>
            <span className="text-3xl font-extrabold text-[#1d1d1f] tracking-tight mt-1 block">
              ₹{(receipt.actual_cost || 0.00).toFixed(2)}
            </span>
          </div>

          {/* Total Energy Usage Card */}
          <div className="w-full glass rounded-[20px] p-4 border border-black/5 text-center relative overflow-hidden">
            <span className="text-[10px] font-extrabold text-[#86868b] uppercase tracking-widest block">
              Total Energy Usage
            </span>
            <span className="text-2xl font-extrabold text-[#1d1d1f] tracking-tight mt-1 block">
              {(receipt.energy_kwh || 0.00).toFixed(2)} kWh
            </span>
          </div>

          {/* Session Telemetry Details Table */}
          <div className="w-full glass rounded-[24px] p-5 border border-black/5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Vehicle Model</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.vehicle_model || "--"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Stop Reason</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.stop_reason || "Stopped Remotely"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Start Time</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.start_time_formatted || "09:02 PM"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">End Time</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.end_time_formatted || "09:07 PM"}</span>
            </div>
          </div>

          {/* Transaction ID block with copy action */}
          <div className="w-full text-center space-y-1.5 mt-2 mb-1">
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">
              Transaction ID
            </span>
            <div className="flex items-center justify-center space-x-2">
              <span className="font-mono text-xs text-[#86868b] tracking-wider">
                {receipt.transaction_id || "1780500727198__15737782"}
              </span>
              <button 
                onClick={() => handleCopyTx(receipt.transaction_id || "1780500727198__15737782")}
                className="h-7 w-7 rounded-lg bg-black/5 hover:bg-black/10 border border-black/10 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition active:scale-90"
                title="Copy Transaction ID"
              >
                {copiedTx ? (
                  <Check className="h-3.5 w-3.5 text-apple-emerald" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Prepaid Authorization and Refund Summary Banner */}
          <div className="w-full glass bg-apple-emerald/5 border border-apple-emerald/20 p-4 rounded-[20px] flex items-start space-x-3 text-xs leading-relaxed">
            <Wallet className="h-5 w-5 text-apple-emerald flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-black/70">
              <span className="font-bold text-[#1d1d1f] block">Refund Initiated instantly!</span>
              <p className="font-light">
                Authorized: <span className="font-bold text-[#1d1d1f]">₹{(receipt.prepaid_amount || 0.00).toFixed(2)}</span> • Charged: <span className="font-bold text-[#1d1d1f]">₹{(receipt.actual_cost || 0.00).toFixed(2)}</span>
              </p>
              <p className="mt-1 font-semibold text-apple-emerald flex items-center">
                Excess of ₹{(receipt.refund_amount || 0.00).toFixed(2)} is dispatched directly to the paying UPI ID.
              </p>
            </div>
          </div>

          {/* Action buttons: Download Invoice (Orange CTA) & Reset */}
          <div className="w-full space-y-3 pt-2">
            {/* Download Invoice (Orange Button matching chargeMOD) */}
            <button 
              onClick={() => handleDownloadInvoice(receipt)}
              className="w-full bg-[#e07a2c] hover:bg-[#c66c25] text-white font-bold py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-2 text-sm shadow-lg shadow-orange-500/15"
            >
              <ArrowDownCircle className="h-4.5 w-4.5" />
              <span>Download Invoice</span>
            </button>

            {/* Start a New Charging Session */}
            <button 
              onClick={handleReset}
              className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-2 text-sm shadow-md"
            >
              <RotateCcw className="h-4 w-4 text-white" />
              <span>Start a New Charging Session</span>
            </button>
          </div>

          {/* Need help support quick link */}
          <div className="text-center mt-2 pb-4">
            <span className="text-xs text-black/40 block font-light">
              Need help with your summary?
            </span>
            <span 
              onClick={() => setScreen("support")}
              className="text-[#e07a2c] text-xs font-semibold cursor-pointer hover:underline mt-1 inline-block"
            >
              Feel Free to Contact Us
            </span>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 6: HELP & SUPPORT PAGE ==================== */}
      {screen === "support" && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="glass rounded-[32px] p-6 space-y-4 border-black/5">
            <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">UPICharge Support</h2>
            <p className="text-xs text-[#86868b] font-light">
              Facing issues with a charger? Our operations desk can help verify, trigger, or force-stop sessions manually.
            </p>
          </div>

          <div className="glass rounded-3xl p-6 space-y-4 border-black/5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b]">Direct Live Helplines</h3>
            <div className="space-y-2 text-sm">
              <a 
                href="https://wa.me/918086477654" 
                target="_blank" 
                rel="noreferrer"
                className="w-full p-4 rounded-2xl border border-black/5 glass hover:bg-black/5 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-apple-emerald/10 border border-apple-emerald/20 flex items-center justify-center text-apple-emerald">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <span className="font-semibold text-[#1d1d1f]">WhatsApp Business Support</span>
                </div>
                <ArrowRight className="h-4 w-4 text-[#86868b]" />
              </a>

              <a 
                href="tel:+918086477654"
                className="w-full p-4 rounded-2xl border border-black/5 glass hover:bg-black/5 flex items-center justify-between transition text-left"
              >
                <div className="flex flex-col justify-start">
                  <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">Helpline Desk</span>
                  <span className="text-[#1d1d1f] font-bold text-lg mt-1">+91 80864 77654</span>
                  <p className="text-xs text-[#86868b] mt-1 font-light">Available 24x7 for physical charging site assistance.</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#86868b]" />
              </a>
            </div>
          </div>

          {/* Live Operator Chat card */}
          <div className="glass rounded-3xl p-6 space-y-4 border-black/5 flex flex-col">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-apple-emerald animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1d1d1f]">Live Operator Chat</h3>
              </div>
              <span className="text-[10px] text-[#86868b] font-medium font-mono bg-black/5 px-2 py-0.5 rounded-full">
                ID: {chatUserId ? chatUserId.slice(-4).toUpperCase() : ""}
              </span>
            </div>

            {/* Chat Thread */}
            <div className="h-60 overflow-y-auto px-1 space-y-3 flex flex-col pr-1">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-2">
                  <div className="h-10 w-10 rounded-full bg-apple-accent/10 flex items-center justify-center text-apple-accent">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <h4 className="text-xs font-bold text-[#1d1d1f]">No messages yet</h4>
                  <p className="text-[10px] text-[#86868b] max-w-[200px] leading-relaxed">
                    Ask any question! Type below to contact our active operational support deck.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col max-w-[85%] ${
                        isUser ? "self-end items-end" : "self-start items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2 text-xs leading-relaxed ${
                          isUser
                            ? "bg-apple-accent text-white rounded-br-none"
                            : "bg-black/5 text-[#1d1d1f] rounded-bl-none"
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[8px] text-[#86868b] mt-1 px-1 font-light">
                        {msg.timestamp
                          ? new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input form */}
            <form onSubmit={handleSendChatMessage} className="flex gap-2 border-t border-black/5 pt-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                disabled={isChatSending}
                className="flex-1 bg-black/5 border border-black/5 rounded-xl px-4 py-2.5 text-xs font-medium placeholder-black/30 text-[#1d1d1f]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatSending}
                className="bg-apple-accent hover:bg-opacity-90 disabled:bg-[#86868b]/20 disabled:text-[#86868b] text-white font-bold px-4 rounded-xl text-xs transition active:scale-95 flex items-center justify-center"
              >
                {isChatSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Send</span>
                )}
              </button>
            </form>
          </div>

          <button 
            onClick={() => setScreen("home")}
            className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-sm"
          >
            Back to Scanner
          </button>
        </div>
      )}

      {/* ==================== SCREEN 7: MAPS (SIMULATED LOCATOR) ==================== */}
      {screen === "map" && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="glass rounded-[32px] p-6 space-y-4 border-black/5">
            <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">Charger Locator Map</h2>
            <p className="text-xs text-[#86868b] font-light">
              Find physical chargeMOD chargers verified by upiCHARGE nearby.
            </p>
          </div>

          <div className="glass rounded-3xl p-5 space-y-4 border-black/5">
            <div 
              ref={mapRef} 
              className="h-64 rounded-2xl relative shadow-inner overflow-hidden border border-black/10 bg-black/5" 
              id="map-container"
            >
              {isMapLoading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="h-6 w-6 text-[#e07a2c] animate-spin" />
                  <span className="text-[10px] text-[#86868b] font-medium">Scanning 30 km radius...</span>
                </div>
              )}
              {mapError && (
                <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center p-4 text-center space-y-2">
                  <AlertCircle className="h-6 w-6 text-apple-rose" />
                  <span className="text-xs text-[#1d1d1f] font-bold">{mapError}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {nearbyChargers.length === 0 && !isMapLoading ? (
                <p className="text-xs text-[#86868b] text-center py-4 font-light">No chargers found within 30 km radius.</p>
              ) : (
                nearbyChargers.map(cp => (
                  <div key={cp.identity} className="glass-light p-4 rounded-2xl flex items-start justify-between border-black/5 transition hover:bg-black/5">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[#1d1d1f]">{cp.chargerName || cp.identity}</span>
                      <p className="text-[11px] text-[#86868b] truncate max-w-[180px]">{cp.locationName || 'Unknown Location'}</p>
                      <div className="flex items-center space-x-1.5 mt-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-apple-emerald animate-pulse"></span>
                        <span className="text-[10px] text-apple-emerald font-bold">
                          {cp.distance ? `${cp.distance.toFixed(1)} km away` : 'Nearby'}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setQrInput(cp.identity);
                        handleVerify(cp.identity);
                      }}
                      className="bg-[#007aff] hover:bg-opacity-90 text-white font-semibold py-1.5 px-3 rounded-full text-xs shadow-md select-none cursor-pointer"
                    >
                      Select
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <button 
            onClick={() => setScreen("home")}
            className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-sm"
          >
            Back to Scanner
          </button>
        </div>
      )}

      {/* Apple style Bottom Floating Navigation dock bar */}
      {screen !== "charging" && (
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] h-16 glass rounded-full flex items-center justify-around px-4 z-40 shadow-lg shadow-black/5 border-black/5">
          <button 
            onClick={() => { stopScanner(); setScreen("home"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "home" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <Camera className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Scan</span>
          </button>
          
          <button 
            onClick={() => { stopScanner(); setScreen("map"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "map" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <MapPin className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Map</span>
          </button>
          
          <button 
            onClick={() => { stopScanner(); setScreen("support"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "support" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Support</span>
          </button>
        </nav>
      )}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    </main>
  );
}
