import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  Grid,
  List,
  Search,
  ArrowLeft,
  Settings,
  ChevronRight,
  HardDrive,
  RefreshCw,
  X,
  File as FileIcon,
  Box,
} from "lucide-react";

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getFileIcon = (fileName) => {
  const ext = fileName.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return <ImageIcon className="w-6 h-6 text-purple-500" />;
  }
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) {
    return <Video className="w-6 h-6 text-red-500" />;
  }
  if (["mp3", "wav", "ogg"].includes(ext)) {
    return <Music className="w-6 h-6 text-yellow-500" />;
  }
  if (["pdf", "doc", "docx", "txt"].includes(ext)) {
    return <FileText className="w-6 h-6 text-blue-500" />;
  }
  if (["stl", "obj"].includes(ext)) {
    return <Box className="w-6 h-6 text-orange-500" />;
  }
  return <FileIcon className="w-6 h-6 text-gray-400" />;
};

const isImage = (fileName) => {
  const ext = fileName.split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
};

const isSTL = (fileName) => {
  const ext = fileName.split(".").pop().toLowerCase();
  return ext === "stl";
};

const DEFAULT_THUMB_SIZE = 220;

const buildFileUrl = (key, { inline = false, download = false } = {}) => {
  let url = `/api/storage/file?key=${encodeURIComponent(key)}`;
  if (inline) url += "&inline=1";
  if (download) url += "&download=1";
  return url;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

let threeLoaderPromise = null;
const stlPreviewCache = new Map();

const loadThreeJS = async () => {
  if (
    window.THREE &&
    window.THREE.STLLoader &&
    window.THREE.OrbitControls
  ) {
    return window.THREE;
  }

  if (threeLoaderPromise) {
    return threeLoaderPromise;
  }

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

  threeLoaderPromise = (async () => {
    if (!window.THREE) {
      await loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
      );
    }
    if (!window.THREE.STLLoader) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js"
      );
    }
    if (!window.THREE.OrbitControls) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
      );
    }
    return window.THREE;
  })();

  return threeLoaderPromise;
};

const buildStlPreviewDataUrl = async (key, signal) => {
  const response = await fetch(buildFileUrl(key, { inline: true }), {
    signal,
  });
  if (!response.ok) {
    throw new Error("Fetch STL preview failed");
  }
  const buffer = await response.arrayBuffer();
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const THREE = await loadThreeJS();
  const loader = new THREE.STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  geometry.center();
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const scale = 30 / maxDim;
  const radius =
    geometry.boundingSphere?.radius ?? Math.max(maxDim, 1) / 2;
  const scaledRadius = radius * scale;
  const width = DEFAULT_THUMB_SIZE;
  const height = DEFAULT_THUMB_SIZE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = scaledRadius / Math.sin(fov / 2);
  const minDistance = Math.max(scaledRadius * 2, 18);
  const cameraDistance = Math.max(distance, minDistance);
  camera.position.set(cameraDistance, cameraDistance, cameraDistance);
  camera.lookAt(0, 0, 0);
  camera.far = cameraDistance * 5;
  camera.updateProjectionMatrix();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    canvas,
  });
  renderer.setSize(width, height, false);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 50, 50);
  scene.add(dirLight);

  const material = new THREE.MeshPhongMaterial({
    color: 0x2563eb,
    specular: 0x111111,
    shininess: 200,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale, scale, scale);
  scene.add(mesh);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  renderer.dispose();
  if (geometry.dispose) {
    geometry.dispose();
  }
  if (material.dispose) {
    material.dispose();
  }

  return dataUrl;
};

const STLViewer = ({ url }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let scene;
    let camera;
    let renderer;
    let controls;
    let animationId;

    const init = async () => {
      try {
        const THREE = await loadThreeJS();
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf3f4f6);
        const gridHelper = new THREE.GridHelper(200, 20, 0xdddddd, 0xdddddd);
        scene.add(gridHelper);

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(50, 50, 50);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        containerRef.current.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0, 100, 0);
        scene.add(dirLight);

        const loader = new THREE.STLLoader();
        loader.load(
          url,
          (geometry) => {
            geometry.computeBoundingBox();
            geometry.boundingBox.getCenter(new THREE.Vector3());
            geometry.center();

            const material = new THREE.MeshPhongMaterial({
              color: 0x2563eb,
              specular: 0x111111,
              shininess: 200,
            });
            const mesh = new THREE.Mesh(geometry, material);

            const box = geometry.boundingBox;
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 40 / maxDim;
            mesh.scale.set(scale, scale, scale);
            mesh.rotation.x = -Math.PI / 2;
            scene.add(mesh);
            setLoading(false);
          },
          undefined,
          () => {
            setError("Không thể tải file STL");
            setLoading(false);
          }
        );

        const animate = () => {
          animationId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
      } catch (err) {
        console.error(err);
        setError("Lỗi khởi tạo 3D Engine");
        setLoading(false);
      }
    };

    init();
    return () => {
      cancelAnimationFrame(animationId);
      if (renderer && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, [url]);

  return (
    <div className="w-full h-full relative bg-gray-100 rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-blue-600 font-medium">
            Đang dựng hình 3D...
          </span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 font-medium">
          {error}
        </div>
      )}
      <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white bg-opacity-80 px-2 py-1 rounded shadow pointer-events-none">
        Chuột trái: Xoay • Chuột phải: Di chuyển • Lăn chuột: Zoom
      </div>
    </div>
  );
};

const PREVIEW_FAILED = Symbol('preview-failed');

const useStlPreview = (key) => {
  const [preview, setPreview] = useState(() => stlPreviewCache.get(key) || null);

  useEffect(() => {
    if (!key) {
      return undefined;
    }
    if (stlPreviewCache.get(key)) {
      setPreview(stlPreviewCache.get(key));
      return undefined;
    }

    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const thumbnail = await buildStlPreviewDataUrl(key, controller.signal);
        const cacheValue = thumbnail || PREVIEW_FAILED;
        stlPreviewCache.set(key, cacheValue);
        if (mounted) {
          setPreview(cacheValue);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("STL preview build error", err);
        stlPreviewCache.set(key, PREVIEW_FAILED);
        if (mounted) {
          setPreview(PREVIEW_FAILED);
        }
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [key]);

  return preview;
};

const STLPreviewImage = ({ fileKey }) => {
  const preview = useStlPreview(fileKey);
  if (preview && preview !== PREVIEW_FAILED) {
    return (
      <img
        src={preview}
        alt={fileKey}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    );
  }
  if (preview === PREVIEW_FAILED) {
    return (
      <div className="text-[10px] text-red-400 px-2 text-center">
        Không thể dựng hình
      </div>
    );
  }
  return (
    <div className="text-[10px] text-gray-400 px-2 text-center">
      Đang dựng hình...
    </div>
  );
};

function ServerPortal() {
  const [connection, setConnection] = useState({
    ready: false,
    bucket: "storage_1",
    endpoint: "127.0.0.1",
    port: 9000,
    useSSL: false,
    hasClient: false,
  });
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState([]);
  const [viewMode, setViewMode] = useState("grid");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [flattenMode, setFlattenMode] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/storage/status");
      const data = await res.json();
      if (!res.ok || !data.hasClient) {
        throw new Error(data.error || "Storage API không khả dụng");
      }
      setConnection({
        ready: !!data.ok,
        bucket: data.bucket,
        endpoint: data.endpoint,
        port: data.port,
        useSSL: data.useSSL,
        hasClient: data.hasClient,
      });
      if (!data.ok) {
        setError("Server chưa sẵn sàng. Thử lại sau.");
      } else {
        setError(null);
      }
      return !!data.ok;
    } catch (err) {
      console.error(err);
      setConnection((prev) => ({
        ...prev,
        ready: false,
        hasClient: false,
      }));
      setError(err.message || "Không thể kết nối Server");
      return false;
    }
  }, []);

  const fetchFiles = useCallback(
    async (prefix = "") => {
      if (!connection.ready) {
        setFiles([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
        const res = await fetch(`/api/storage/list${query}`);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Không thể tải danh sách tệp");
        }
        setFiles(data.items || []);
      } catch (err) {
        console.error(err);
        setFiles([]);
        setError(err.message || "Không thể tải dữ liệu Server");
      } finally {
        setIsLoading(false);
      }
    },
    [connection.ready]
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (connection.ready && !flattenMode) {
      fetchFiles(currentPath);
    }
  }, [connection.ready, currentPath, fetchFiles, flattenMode]);

  const handleNavigate = (path) => {
    if (flattenMode) {
      setFlattenMode(false);
    }
    setCurrentPath(path);
    setSearchTerm("");
  };

  const handleUpLevel = () => {
    if (currentPath === "") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const newPath = parts.length > 0 ? parts.join("/") + "/" : "";
    handleNavigate(newPath);
  };

  const buildFileUrl = useCallback(
    (key, { inline = false, download = false } = {}) => {
      let url = `/api/storage/file?key=${encodeURIComponent(key)}`;
      if (inline) url += "&inline=1";
      if (download) url += "&download=1";
      return url;
    },
    []
  );

  const handleFileClick = (file) => {
    if (file.isFolder) {
      handleNavigate(file.key);
      return;
    }

    const url = buildFileUrl(file.key, { inline: true });
    const name = file.key.split("/").filter(Boolean).pop();

    if (isImage(file.key)) {
      setPreviewFile({ type: "image", url, name, key: file.key });
    } else if (isSTL(file.key)) {
      setPreviewFile({ type: "stl", url, name, key: file.key });
    } else {
      window.open(buildFileUrl(file.key, { download: true }), "_blank");
    }
  };

  const connectionStatus = connection.ready
    ? "Server đã kết nối"
    : connection.hasClient
    ? "Đang đợi Server phản hồi..."
    : "Storage API không khả dụng";

  const handleFlattenToggle = async () => {
    if (flattenMode) {
      setFlattenMode(false);
      fetchFiles(currentPath);
      return;
    }
    if (!connection.ready) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/storage/flatten?ext=stl");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể tải dữ liệu Server");
      }
      setFiles(data.items || []);
      // Set sorting by date descending to show newest items first
      setSortField("date");
      setSortDir("desc"); // "desc" means newer dates (larger values) come first
      setFlattenMode(true);
      setCurrentPath("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Không thể tải dữ liệu Server");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFiles = files.filter((f) => {
    const name = f.key.split("/").filter(Boolean).pop() || f.key;
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const sortedFiles = useMemo(() => {
    const list = [...filteredFiles];
    const compareStrings = (a, b) =>
      a.localeCompare(b, "vi", { sensitivity: "base" });
    list.sort((a, b) => {
      const nameA = a.key.split("/").filter(Boolean).pop() || a.key;
      const nameB = b.key.split("/").filter(Boolean).pop() || b.key;
      let result = 0;
      if (sortField === "size") {
        const sizeA = a.isFolder ? 0 : a.size || 0;
        const sizeB = b.isFolder ? 0 : b.size || 0;
        result = sizeA - sizeB;
      } else if (sortField === "date") {
        const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        result = dateA - dateB;
      } else {
        result = compareStrings(nameA, nameB);
      }
      if (result === 0 && sortField !== "name") {
        result = compareStrings(nameA, nameB);
      }
      return sortDir === "asc" ? result : -result;
    });
    return list;
  }, [filteredFiles, sortField, sortDir]);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIndicator = (field) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
    );
  };

  const headerButtonClass = (field) =>
    `flex items-center ${
      sortField === field ? "text-blue-600" : "text-gray-500"
    }`;

  const summary = useMemo(() => {
    let totalSize = 0;
    let stlCount = 0;
    sortedFiles.forEach((file) => {
      if (!file.isFolder) {
        totalSize += file.size || 0;
        if (isSTL(file.key)) {
          stlCount += 1;
        }
      }
    });
    return { totalSize, stlCount };
  }, [sortedFiles]);

  const totalPages = useMemo(() => {
    const total = Math.ceil(sortedFiles.length / pageSize) || 1;
    return total;
  }, [sortedFiles.length, pageSize]);

  const safePage = useMemo(
    () => Math.max(1, Math.min(currentPage, totalPages)),
    [currentPage, totalPages]
  );

  const paginatedFiles = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedFiles.slice(start, start + pageSize);
  }, [sortedFiles, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [files, searchTerm, currentPath, flattenMode, pageSize]);

  useEffect(() => {
    setCurrentPage((prev) => {
      const next = Math.min(Math.max(prev, 1), totalPages);
      return next === prev ? prev : next;
    });
  }, [totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const handlePageSizeChange = (event) => {
    const value = Number(event.target.value) || PAGE_SIZE_OPTIONS[0];
    setPageSize(value);
  };

  const handlePageChange = (delta) => {
    setCurrentPage((prev) => {
      const next = prev + delta;
      return Math.min(Math.max(next, 1), totalPages);
    });
  };

  const handlePageInputSubmit = (event) => {
    event.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const next = Math.min(Math.max(parsed, 1), totalPages);
    setCurrentPage(next);
    setPageInput(String(next));
  };

  const pageStart =
    sortedFiles.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd =
    sortedFiles.length === 0
      ? 0
      : Math.min(safePage * pageSize, sortedFiles.length);

  const getBreadcrumbs = () => {
    const parts = currentPath.split("/").filter(Boolean);
    let pathAccumulator = "";
    const rootLabel = connection.bucket || "Storage";
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => handleNavigate("")}
          className={`hover:text-blue-600 flex items-center ${
            currentPath === "" ? "font-bold text-blue-800" : ""
          }`}
        >
          <HardDrive className="w-4 h-4 mr-1" /> {rootLabel}
        </button>
        {flattenMode ? (
          <>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              Toàn bộ STL
            </span>
          </>
        ) : (
          parts.map((part, index) => {
            pathAccumulator += part + "/";
            const isLast = index === parts.length - 1;
            const targetPath = pathAccumulator;
            return (
              <React.Fragment key={targetPath}>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <button
                  onClick={() => handleNavigate(targetPath)}
                  className={`hover:text-blue-600 ${
                    isLast ? "font-bold text-gray-800" : ""
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-blue-200 shadow-lg">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                {connection.bucket || "Kiri Storage"}
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">
                {connectionStatus}
              </p>
            </div>
          </div>

          <div className="flex-1 max-w-xl mx-4 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Tìm kiếm tệp..."
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-full transition-all duration-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${
                connection.ready
                  ? "text-green-600 bg-green-50"
                  : "text-gray-600"
              }`}
              title="Cấu hình kết nối"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div> */}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-100 max-w-full overflow-hidden">
            <button
              onClick={handleUpLevel}
              disabled={!currentPath || flattenMode}
              className="mr-3 p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {getBreadcrumbs()}
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <button
              onClick={() => fetchFiles(currentPath)}
              className="p-2 text-gray-500 hover:bg-white hover:text-blue-600 rounded-lg transition-colors"
              title="Làm mới"
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
            <div className="bg-white p-1 rounded-lg border border-gray-200 flex items-center shadow-sm">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${
                  viewMode === "grid"
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${
                  viewMode === "list"
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
            <div className="hidden sm:flex flex-col text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <span>
                STL: <span className="font-semibold text-gray-800">{summary.stlCount}</span>
              </span>
              <span>
                Tổng dung lượng: <span className="font-semibold text-gray-800">{formatBytes(summary.totalSize) || "0"}</span>
              </span>
            </div>
            <button
              onClick={handleFlattenToggle}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                flattenMode
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  : "bg-white text-gray-600 border-gray-200 hover:text-blue-600"
              }`}
            >
              {flattenMode ? "Thoát chế độ toàn bộ STL" : "Xem toàn bộ STL"}
            </button>
          </div>
        </div>

        <div className="sm:hidden bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 shadow-sm mb-4">
          <div>
            STL: <span className="font-semibold text-gray-800">{summary.stlCount}</span>
          </div>
          <div>
            Tổng dung lượng: <span className="font-semibold text-gray-800">{formatBytes(summary.totalSize) || "0"}</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <X className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
                <p className="text-xs text-red-500 mt-1">
                  Kiểm tra container Server hoặc endpoint{" "}
                  <code>/api/storage/status</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border-2 border-dashed border-gray-200">
            <Folder className="w-16 h-16 mb-4 text-gray-200" />
            <p>Thư mục trống</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {paginatedFiles.map((file) => {
              const name = file.key.split("/").filter(Boolean).pop();
              const isFolder = file.isFolder;
              const isStlFile = isSTL(file.key);
              return (
                <div
                  key={file.key}
                  onClick={() => handleFileClick(file)}
                  className="group bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex flex-col items-center text-center relative"
                >
                  <div className="w-28 h-28 mb-3 flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden">
                    {isFolder ? (
                      <Folder className="w-10 h-10 text-yellow-500" />
                    ) : isStlFile ? (
                      <STLPreviewImage fileKey={file.key} />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white">
                        {getFileIcon(name)}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-sm font-medium text-gray-700 truncate w-full px-2"
                    title={name}
                  >
                    {name}
                  </span>
                  {!isFolder && (
                    <span className="text-xs text-gray-400 mt-1">
                      {formatBytes(file.size)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    <button
                      className={headerButtonClass("name")}
                      onClick={() => handleSort("name")}
                    >
                      Tên
                      {renderSortIndicator("name")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    <button
                      className={headerButtonClass("size")}
                      onClick={() => handleSort("size")}
                    >
                      Kích thước
                      {renderSortIndicator("size")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell">
                    <button
                      className={headerButtonClass("date")}
                      onClick={() => handleSort("date")}
                    >
                      Ngày sửa đổi
                      {renderSortIndicator("date")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedFiles.map((file) => {
                  const name = file.key.split("/").filter(Boolean).pop();
                  return (
                    <tr
                      key={file.key}
                      className="hover:bg-blue-50 transition-colors cursor-pointer group"
                      onClick={() => handleFileClick(file)}
                    >
                      <td className="px-6 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded bg-gray-50">
                            {file.isFolder ? (
                              <Folder className="w-6 h-6 text-yellow-500" />
                            ) : (
                              getFileIcon(name)
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {file.isFolder ? "-" : formatBytes(file.size)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                        {formatDate(file.lastModified)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {!file.isFolder && (
                          <button
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Tải xuống"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                buildFileUrl(file.key, { download: true }),
                                "_blank"
                              );
                            }}
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sortedFiles.length > 0 && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-gray-600">
              Hiển thị{" "}
              <span className="font-semibold text-gray-900">
                {pageStart}-{pageEnd}
              </span>{" "}
              trên tổng{" "}
              <span className="font-semibold text-gray-900">
                {sortedFiles.length}
              </span>{" "}
              tệp
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <label className="flex items-center text-sm text-gray-500 gap-2">
                Mỗi trang
                <select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} tệp
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(-1)}
                  disabled={currentPage <= 1}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trước
                </button>
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  Trang {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sau
                </button>
              </div>
              <form
                onSubmit={handlePageInputSubmit}
                className="flex items-center gap-2 text-sm text-gray-500"
              >
                <span>Đi tới</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                />
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Đi
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
          &copy; 2025 The Uy's Storage System. Powered by LTD's Service.
        </div>
      </footer>

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                Cấu hình kết nối Server
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Bucket
                </p>
                <p className="text-base font-semibold text-gray-900">
                  {connection.bucket || "-"}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Endpoint
                  </p>
                  <p className="text-sm text-gray-900">
                    {connection.endpoint || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Cổng
                  </p>
                  <p className="text-sm text-gray-900">{connection.port}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Giao thức
                  </p>
                  <p className="text-sm text-gray-900">
                    {connection.useSSL ? "HTTPS" : "HTTP"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Trạng thái
                  </p>
                  <p
                    className={`text-sm font-semibold ${
                      connection.ready
                        ? "text-green-600"
                        : connection.hasClient
                        ? "text-yellow-600"
                        : "text-red-500"
                    }`}
                  >
                    {connectionStatus}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                Cấu hình nằm trong container nên bạn không cần nhập thủ công.
                Sử dụng biến môi trường <code>Server_*</code> trong docker stack
                để thay đổi thông số nếu cần.
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={async () => {
                  const ok = await fetchStatus();
                  if (ok) {
                    fetchFiles(currentPath);
                  }
                }}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Làm mới trạng thái
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div className="relative w-full max-w-5xl h-[80vh] flex flex-col items-center bg-transparent">
            <div className="absolute -top-12 right-0 left-0 flex justify-between items-center text-white px-2">
              <h3 className="font-medium text-lg truncate pr-4">
                {previewFile.name}
              </h3>
              <button
                className="text-white hover:text-gray-300 p-2"
                onClick={() => setPreviewFile(null)}
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div
              className="w-full h-full flex items-center justify-center bg-black/20 rounded-lg overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {previewFile.type === "image" && (
                <img
                  src={previewFile.url}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {previewFile.type === "stl" && <STLViewer url={previewFile.url} />}
            </div>

            <a
              href={buildFileUrl(previewFile.key || "", { download: true })}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-4 inline-flex items-center px-4 py-2 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full transition-all border border-white/20 backdrop-blur-sm"
            >
              <Download className="w-4 h-4 mr-2" /> Tải bản gốc
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<ServerPortal />);
