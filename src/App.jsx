import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

function SignLanguageTranslator() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const progressFillRef = useRef(null);
    const delayFillRef = useRef(null);
    const [topPrediction, setTopPrediction] = useState("N/A");
    const [correctedSentence, setCorrectedSentence] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cameraStarted, setCameraStarted] = useState(false);

    const startCamera = () => {
        console.log("Starting camera with MediaPipe...");
        if (!videoRef.current) {
            console.log("Video ref not available");
            return;
        }

        if (!window.Holistic || !window.Camera) {
            setError(
                "MediaPipe libraries are not loaded. Please refresh the page."
            );
            return;
        }

        // WebSocket setup
        const wsUrl = `ws://${window.location.hostname || "localhost"}:8000/ws`;
        let socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("WebSocket connected");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Received data:", data);

                if (
                    data.top_k_predictions &&
                    data.top_k_predictions.length > 0
                ) {
                    const topPred = data.top_k_predictions[0];
                    setTopPrediction(
                        `${topPred.label} (${topPred.probability.toFixed(2)}%)`
                    );
                }

                if (data.corrected_sentence_text !== undefined) {
                    setCorrectedSentence(data.corrected_sentence_text);
                }
            } catch (e) {
                console.error("Error processing message:", e);
            }
        };

        socket.onerror = (err) => {
            console.error("WebSocket error:", err);
        };

        socket.onclose = (event) => {
            console.log("WebSocket disconnected:", event.reason);
        };

        // MediaPipe Holistic setup
        try {
            console.log("Creating Holistic instance...");
            const holistic = new window.Holistic({
                locateFile: (file) => {
                    console.log("Loading MediaPipe file:", file);
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
                },
            });

            console.log("Setting Holistic options...");
            holistic.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            console.log("Setting Holistic onResults...");
            holistic.onResults((results) => {
                // Extract keypoints
                const pose = results.poseLandmarks
                    ? results.poseLandmarks.flatMap((res) => [
                          res.x,
                          res.y,
                          res.z,
                      ])
                    : Array(33 * 3).fill(0);
                const lh = results.leftHandLandmarks
                    ? results.leftHandLandmarks.flatMap((res) => [
                          res.x,
                          res.y,
                          res.z,
                      ])
                    : Array(21 * 3).fill(0);
                const rh = results.rightHandLandmarks
                    ? results.rightHandLandmarks.flatMap((res) => [
                          res.x,
                          res.y,
                          res.z,
                      ])
                    : Array(21 * 3).fill(0);
                const keypoints = [...pose, ...lh, ...rh];

                // Send keypoints to server
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(keypoints));
                }
            });

            console.log("Creating Camera instance...");
            const camera = new window.Camera(videoRef.current, {
                onFrame: async () => {
                    try {
                        await holistic.send({ image: videoRef.current });
                    } catch (frameError) {
                        console.error("Error processing frame:", frameError);
                    }
                },
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT,
            });

            console.log("Starting camera...");
            camera.start();
            setCameraStarted(true);
            console.log("Camera with MediaPipe started successfully");
        } catch (err) {
            console.error("Error initializing MediaPipe:", err);
            setError(
                "Failed to initialize MediaPipe. Please refresh the page."
            );
        }
    };

    useEffect(() => {
        // Check if MediaPipe libraries are available
        if (!window.Holistic || !window.Camera) {
            console.log("MediaPipe libraries not available, using simple mode");
            setIsLoading(false);
            return;
        }
        console.log("MediaPipe libraries available");
        setIsLoading(false);
    }, []);

    if (error) {
        return (
            <div
                style={{
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                    margin: 0,
                    padding: "20px",
                    backgroundColor: "#f4f6f8",
                    color: "#333",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minHeight: "100vh",
                    lineHeight: 1.6,
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        backgroundColor: "#f8d7da",
                        border: "1px solid #f5c6cb",
                        color: "#721c24",
                        padding: "12px 20px",
                        borderRadius: "6px",
                        maxWidth: "400px",
                    }}
                >
                    <strong>Error: </strong>
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div
                style={{
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                    margin: 0,
                    padding: "20px",
                    backgroundColor: "#f4f6f8",
                    color: "#333",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minHeight: "100vh",
                    lineHeight: 1.6,
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        backgroundColor: "#ffffff",
                        padding: "32px",
                        borderRadius: "12px",
                        boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
                        maxWidth: "400px",
                        textAlign: "center",
                    }}
                >
                    <div
                        style={{
                            width: "48px",
                            height: "48px",
                            border: "2px solid #e3e3e3",
                            borderTop: "2px solid #17a2b8",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }}
                    ></div>
                    <p style={{ color: "#495057", margin: 0 }}>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                margin: 0,
                padding: "20px",
                backgroundColor: "#f4f6f8",
                color: "#333",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minHeight: "100vh",
                lineHeight: 1.6,
                boxSizing: "border-box",
            }}
        >
            <h1
                style={{
                    marginBottom: "20px",
                    color: "#2c3e50",
                    fontWeight: 300,
                    textAlign: "center",
                    width: "100%",
                }}
            >
                Real-time Sign Language Translation
            </h1>

            {!cameraStarted && (
                <div style={{ marginBottom: "20px", textAlign: "center" }}>
                    <button
                        onClick={startCamera}
                        style={{
                            padding: "10px 20px",
                            backgroundColor: "#17a2b8",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "16px",
                        }}
                    >
                        Start Camera
                    </button>
                    <p
                        style={{
                            marginTop: "10px",
                            color: "#6c757d",
                            fontSize: "14px",
                        }}
                    >
                        Click to start camera with MediaPipe processing
                    </p>
                </div>
            )}

            {cameraStarted && (
                <div style={{ marginBottom: "20px", textAlign: "center" }}>
                    <div
                        style={{
                            padding: "8px 16px",
                            backgroundColor: "#d4edda",
                            color: "#155724",
                            borderRadius: "6px",
                            display: "inline-block",
                        }}
                    >
                        ✓ Camera started
                    </div>
                </div>
            )}

            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: "25px",
                    width: "100%",
                    maxWidth: "1200px",
                }}
            >
                <div
                    style={{
                        flex: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minWidth: 0,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            backgroundColor: "#ffffff",
                            padding: "20px",
                            borderRadius: "12px",
                            boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
                            width: "100%",
                        }}
                    >
                        <div
                            style={{
                                position: "relative",
                                width: "100%",
                                paddingTop: "75%",
                                backgroundColor: "#000",
                                marginBottom: "15px",
                                borderRadius: "8px",
                                overflow: "hidden",
                                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                            }}
                        >
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    display: "block",
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    transform: "scaleX(-1)",
                                }}
                            />
                            <canvas
                                ref={canvasRef}
                                width={VIDEO_WIDTH}
                                height={VIDEO_HEIGHT}
                                style={{ display: "none" }}
                            />
                        </div>

                        <div
                            style={{
                                width: "100%",
                                height: "28px",
                                backgroundColor: "#e9ecef",
                                borderRadius: "6px",
                                overflow: "hidden",
                                marginTop: "10px",
                                position: "relative",
                            }}
                        >
                            <div
                                ref={progressFillRef}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: "33.33%",
                                    width: "0%",
                                    height: "100%",
                                    backgroundColor: "#17a2b8",
                                    transition: "none",
                                }}
                            />
                            <div
                                ref={delayFillRef}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "0%",
                                    height: "100%",
                                    backgroundColor: "#ffc107",
                                    transition: "none",
                                }}
                            />
                            <div
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: "33.33%",
                                    width: "2px",
                                    height: "100%",
                                    backgroundColor: "#000",
                                    zIndex: 2,
                                }}
                            />
                            <div
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "16.67%",
                                    transform: "translate(-50%, -50%)",
                                    color: "#495057",
                                    fontSize: "0.9em",
                                    fontWeight: 500,
                                    zIndex: 1,
                                    pointerEvents: "none",
                                }}
                            >
                                Delay
                            </div>
                            <div
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "66.67%",
                                    transform: "translate(-50%, -50%)",
                                    color: "#495057",
                                    fontSize: "0.9em",
                                    fontWeight: 500,
                                    zIndex: 1,
                                    pointerEvents: "none",
                                }}
                            >
                                Frame Buffer
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: "15px",
                        minWidth: "320px",
                        maxWidth: "400px",
                    }}
                >
                    <div
                        style={{
                            padding: "12px",
                            boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
                            marginBottom: "15px",
                            borderLeft: "4px solid #17a2b8",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "0 6px 6px 0",
                        }}
                    >
                        <strong
                            style={{
                                display: "block",
                                marginBottom: "5px",
                                color: "#343a40",
                                fontSize: "0.95em",
                            }}
                        >
                            Top Prediction:
                        </strong>
                        <span
                            style={{
                                color: "#495057",
                                wordWrap: "break-word",
                                fontSize: "1em",
                                display: "block",
                                minHeight: "1.2em",
                            }}
                        >
                            {topPrediction}
                        </span>
                    </div>

                    <div
                        style={{
                            padding: "12px",
                            boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
                            marginBottom: "15px",
                            borderLeft: "4px solid #17a2b8",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "0 6px 6px 0",
                        }}
                    >
                        <strong
                            style={{
                                display: "block",
                                marginBottom: "5px",
                                color: "#343a40",
                                fontSize: "0.95em",
                            }}
                        >
                            Corrected Sentence:
                        </strong>
                        <span
                            style={{
                                color: "#495057",
                                wordWrap: "break-word",
                                fontSize: "1em",
                                display: "block",
                                minHeight: "1.2em",
                            }}
                        >
                            {correctedSentence}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function App() {
    return (
        <>
            <SignLanguageTranslator />
        </>
    );
}

export default App;
