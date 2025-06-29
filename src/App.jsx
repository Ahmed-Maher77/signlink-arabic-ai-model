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
    const [progressText, setProgressText] = useState("0% (Q: 0/0)");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Check if MediaPipe libraries are available
        if (!window.Holistic || !window.Camera) {
            setError(
                "MediaPipe libraries are not loaded. Please refresh the page."
            );
            setIsLoading(false);
            return;
        }

        const video = videoRef.current;
        const wsUrl = `ws://${window.location.hostname || "localhost"}:8000/ws`;
        let socket;

        function connectWebSocket() {
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log("WebSocket connected.");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Received data:", data);

                    const rawPercentage =
                        data.buffer_fill_percentage !== undefined
                            ? data.buffer_fill_percentage
                            : 0;
                    updateProgressBar(
                        rawPercentage,
                        data.is_in_delay,
                        data.delay_progress || 0,
                        data.input_queue_actual_size,
                        data.input_queue_target_clip_size
                    );

                    if (
                        data.top_k_predictions &&
                        data.top_k_predictions.length > 0
                    ) {
                        const topPred = data.top_k_predictions[0];
                        setTopPrediction(
                            `${topPred.label} (${topPred.probability.toFixed(
                                2
                            )}%)`
                        );
                    } else {
                        setTopPrediction("N/A");
                    }

                    if (data.corrected_sentence_text !== undefined) {
                        console.log(
                            "Received corrected_sentence_text:",
                            data.corrected_sentence_text
                        );
                        if (data.corrected_sentence_text === "API N/A") {
                            console.log(
                                "API unavailable - showing API N/A message"
                            );
                            setCorrectedSentence("API N/A");
                        } else if (
                            data.corrected_sentence_text &&
                            data.corrected_sentence_text.trim()
                        ) {
                            console.log(
                                "Updating corrected sentence with:",
                                data.corrected_sentence_text
                            );
                            setCorrectedSentence(data.corrected_sentence_text);
                        } else if (
                            !data.original_sentence_text ||
                            data.original_sentence_text === "Original: "
                        ) {
                            console.log(
                                "Clearing corrected sentence display (empty sentence)"
                            );
                            setCorrectedSentence("");
                        }
                    }
                } catch (e) {
                    console.error("Error processing message:", e, event.data);
                }
            };

            socket.onerror = (err) => {
                console.error("WebSocket error:", err);
            };

            socket.onclose = (event) => {
                console.log(
                    "WebSocket disconnected. Reason:",
                    event.reason,
                    "Code:",
                    event.code
                );
                setTimeout(connectWebSocket, 3000);
            };
        }

        function extractAndNormalizeKeypoints(results) {
            // Extract raw keypoints (no centering, no normalization)
            const pose = results.poseLandmarks
                ? results.poseLandmarks
                      .map((res) => [res.x, res.y, res.z])
                      .flat()
                : Array(33 * 3).fill(0);
            const lh = results.leftHandLandmarks
                ? results.leftHandLandmarks
                      .map((res) => [res.x, res.y, res.z])
                      .flat()
                : Array(21 * 3).fill(0);
            const rh = results.rightHandLandmarks
                ? results.rightHandLandmarks
                      .map((res) => [res.x, res.y, res.z])
                      .flat()
                : Array(21 * 3).fill(0);
            return [...pose, ...lh, ...rh];
        }

        function onResults(results) {
            // Send keypoints
            if (socket && socket.readyState === WebSocket.OPEN) {
                const keypoints = extractAndNormalizeKeypoints(results);
                socket.send(JSON.stringify(keypoints));
            }
        }

        function updateProgressBar(
            bufferPercentage,
            isInDelay,
            delayProgress,
            queueSize,
            targetSize
        ) {
            if (isInDelay) {
                const scaledDelayPercentage = (delayProgress * 100) / 3;
                delayFillRef.current.style.width = `${scaledDelayPercentage}%`;
                progressFillRef.current.style.width = "0%";
                setProgressText(`0% (Q: 0/${targetSize})`);
            } else {
                delayFillRef.current.style.width = "33.33%";
                const scaledBufferPercentage = (bufferPercentage * 2) / 3;
                progressFillRef.current.style.width = `${scaledBufferPercentage}%`;
                setProgressText(
                    `${Math.round(
                        bufferPercentage
                    )}% (Q: ${queueSize}/${targetSize})`
                );
            }
        }

        try {
            const holistic = new window.Holistic({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
                },
            });

            holistic.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            holistic.onResults(onResults);

            // Create an offscreen canvas for mirroring
            const offscreenCanvas = document.createElement("canvas");
            offscreenCanvas.width = VIDEO_WIDTH;
            offscreenCanvas.height = VIDEO_HEIGHT;
            const offscreenCtx = offscreenCanvas.getContext("2d");

            const camera = new window.Camera(video, {
                onFrame: async () => {
                    // Mirror the video frame before sending to MediaPipe
                    offscreenCtx.save();
                    offscreenCtx.scale(-1, 1);
                    offscreenCtx.drawImage(
                        video,
                        -VIDEO_WIDTH,
                        0,
                        VIDEO_WIDTH,
                        VIDEO_HEIGHT
                    );
                    offscreenCtx.restore();
                    await holistic.send({ image: offscreenCanvas });
                },
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT,
            });

            connectWebSocket();
            camera.start();
            setIsLoading(false);
        } catch (err) {
            console.error("Error initializing MediaPipe:", err);
            setError(
                "Failed to initialize MediaPipe. Please refresh the page."
            );
            setIsLoading(false);
        }
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
                    <p style={{ color: "#495057", margin: 0 }}>
                        Loading MediaPipe libraries...
                    </p>
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

            <div
                style={{
                    textAlign: "center",
                    marginTop: "5px",
                    fontSize: "0.9em",
                    color: "#495057",
                    fontWeight: 500,
                }}
            >
                {progressText}
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
