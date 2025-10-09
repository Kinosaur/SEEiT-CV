# SEEiT Mobile App — Architecture

A concise, developer-facing view of what runs where and how key flows work.

## C1: System Context

- On-device CV and color assistance (no backend today).
- System TTS; transient files from camera only.

```mermaid
flowchart TD
  user([User]) --- app["SEEiT Mobile App"]

  subgraph device["Mobile Device"]
    app --- rn["React Native Layer"]
    app --- android["Android Native Layer"]
    android --- sensors["Camera and IMU"]
    android --- tts["System TTS"]
  end

  classDef actor fill:#eee,stroke:#999,color:#333;
  class user actor;
```

## C2: Container View (App internals)

```mermaid
flowchart LR
  subgraph App["SEEiT Mobile App"]
    subgraph RN["React Native Layer"]
      ui["UI Screens and Drawer<br/>Home, Color Finder, Feature Select, Feedback"]
      svc["RN Services<br/>SpeechSupervisor, notifier hooks"]
      overlay["Overlays<br/>DetectionOverlay"]
    end

    subgraph Native["Android Native Layer"]
      vc["VisionCamera<br/>Frame Processor"]
      mlp["Kotlin ML Plugin<br/>MlkitObjectDetectPlugin"]
      prot["ProtanToolsModule<br/>Color Assist"]
      mlkit["Google ML Kit<br/>ObjectDetector"]
      imu["SensorManager<br/>Rotation Vector"]
    end

    sysTTS["System TTS"]
    camera["Camera HAL"]
  end

  ui <--> svc
  ui --> vc
  overlay <--> ui

  vc --> mlp
  mlp --> mlkit
  mlp --> imu
  mlp --> vc

  ui --> prot
  ui --> sysTTS

  mlp --- camera
  vc --- camera
```

## C3: Sequence — Color Finder (Capture → Analyze)

```mermaid
sequenceDiagram
  participant U as User
  participant UI as RN Color Finder Screen
  participant Cam as VisionCamera (photo)
  participant PT as ProtanToolsModule
  participant BI as BitmapIO
  participant CVD as CvdSimulation
  participant CS as ColorSpaces

  U->>UI: Tap Capture
  UI->>Cam: takePhoto(flash: off)
  Cam-->>UI: file path (file://…)
  UI->>PT: detectConfusableColors(uri, mode, thresholds)

  PT->>BI: decodeDownsampledOriented(uri)
  BI-->>PT: Bitmap (RGB)

  loop per pixel
    PT->>CS: convert to Lab and name family
    alt protan mode included
      PT->>CVD: simulate protan
    end
    alt deutan mode included
      PT->>CVD: simulate deutan
    end
    PT->>CS: compute deltaE00
    PT->>PT: apply bucketing rules
  end

  PT->>PT: extract regions and stats
  PT-->>UI: regions[], meta
  UI->>UI: open modal and draw
  UI->>U: announce "Analysis complete"
```

## C3: Sequence — Live Detection with Speech

```mermaid
sequenceDiagram
  participant Cam as VisionCamera (frames)
  participant FP as Frame Processor (JS)
  participant MLP as Kotlin Plugin
  participant MLK as ML Kit Detector
  participant IMU as SensorManager
  participant RN as RN UI
  participant Sp as SpeechSupervisor
  participant TTS as System TTS

  Cam->>FP: frame (YUV)
  FP->>MLP: mlkitObjectDetect(frame)
  MLP->>MLP: convert YUV to NV21 and orient
  MLP->>MLK: process InputImage
  MLK-->>MLP: DetectedObject[]
  MLP->>IMU: read pitch
  MLP->>MLP: fuse distances and smooth
  MLP-->>FP: JSON { objects, distance_cat }
  FP-->>RN: set state (objects, dims)
  RN->>RN: render overlay and derive signature
  RN->>Sp: requestSpeak(phrase, priority)
  Sp->>TTS: speak
  TTS-->>Sp: done or error
```

### Notes
- Use `<br/>` for line breaks inside labels in flowcharts.
- Keep each sequence message on a single line; avoid slashes and arrow symbols in the text to prevent parsing issues on GitHub’s Mermaid.