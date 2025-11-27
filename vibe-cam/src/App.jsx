import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { Camera, MapPin, User, Send, Image as ImageIcon, Aperture, Settings, Maximize2, Battery, Upload, X, ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 修复 Leaflet marker 图标问题
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 地图飞行到指定位置
function FlyToLocation({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 13, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

// 地图点击组件
function LocationMarker({ onLocationSelect }) {
  const [position, setPosition] = useState(null);
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      onLocationSelect(e.latlng);
    },
  });
  return position === null ? null : <Marker position={position}></Marker>;
}

// --- 相机模型数据 ---
const CAMERA_MODELS = [
  { 
    id: 'superia', 
    name: 'Fujifilm Superia 400', 
    ratio: '4/3', 
    type: 'Disposable / 35mm', 
    desc: 'Classic nostalgia' 
  },
  { 
    id: 'portra', 
    name: 'Kodak Portra 800', 
    ratio: '4/3', 
    type: 'Professional Film', 
    desc: 'Perfect skin tones' 
  },
  { 
    id: 'ektar', 
    name: 'Kodak Ektar 100', 
    ratio: '4/3', 
    type: 'Professional Film', 
    desc: 'Vivid colors' 
  },
  { 
    id: 'hasselblad', 
    name: 'Hasselblad 500C/M', 
    ratio: '1/1', 
    type: 'Medium Format', 
    desc: 'Professional Studio' 
  },
  { 
    id: 'polaroid', 
    name: 'Polaroid SX-70', 
    ratio: '1/1', 
    type: 'Instant', 
    desc: 'Dreamy vintage' 
  },
  { 
    id: 'contax', 
    name: 'Contax T2', 
    ratio: '3/2', 
    type: 'Point & Shoot', 
    desc: 'High contrast flash' 
  },
  { 
    id: 'leica', 
    name: 'Leica M6', 
    ratio: '3/2', 
    type: 'Rangefinder', 
    desc: 'Street photography' 
  },
  { 
    id: 'hp5', 
    name: 'Ilford HP5 Plus', 
    ratio: '3/2', 
    type: 'B&W Film', 
    desc: 'Classic Monochrome' 
  },
   { 
    id: 'cinestill', 
    name: 'Cinestill 800T', 
    ratio: '16/9', 
    type: 'Film Stock', 
    desc: 'Cinematic night' 
  },
];

export default function VibeCameraFresh() {
  const [schema, setSchema] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generationError, setGenerationError] = useState(false); // 标记生成是否失败
  
  // UI 状态
  const [characterImage, setCharacterImage] = useState(null); // 角色图片 URL
  
  // 将 selectedCamera 改为存储完整的模型对象，默认第一个
  const [selectedModel, setSelectedModel] = useState(CAMERA_MODELS[0]);
  
  const [location, setLocation] = useState(null);
  const [tempLocation, setTempLocation] = useState(null); // 临时地点，等待确认
  const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);
  const [isManualControlsOpen, setIsManualControlsOpen] = useState(false); // 手动控制折叠状态
  const [isLocationOpen, setIsLocationOpen] = useState(false); // Location 折叠状态
  const [cameraSettings, setCameraSettings] = useState({
    aperture: 'f/2.8',
    shutter: '1/125',
    iso: '400'
  });
  // 临时相机设置，用于在确认前存储调整
  const [tempCameraSettings, setTempCameraSettings] = useState({
    aperture: 'f/2.8',
    shutter: '1/125',
    iso: '400'
  });
  
  // 地图搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLocation, setSearchLocation] = useState(null); // 搜索后飞行到的位置
  const [searchError, setSearchError] = useState(''); // 搜索错误信息
  const [selectedLocationName, setSelectedLocationName] = useState(''); // 选中的地点名称
  const searchTimeoutRef = useRef(null); // 用于防抖
  
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 自动滚动聊天
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 初始化
  useEffect(() => {
    // 调用初始化 API 获取初始 schema
    axios.post('http://localhost:8000/api/init')
      .then(res => {
        setSchema(res.data);
        setMessages([{ role: 'ai', text: "👋 Hi! 我是你的 AI 摄影师。你想拍什么样的照片？" }]);
      })
      .catch(e => {
        console.error("Init error:", e);
        // 如果 API 失败，使用默认空对象
        setSchema({});
        setMessages([{ role: 'ai', text: "👋 Hi! 我是你的 AI 摄影师。你想拍什么样的照片？" }]);
      });
  }, []);

  // 发送消息处理
  const handleSend = async (textOverride = null) => {
    const text = textOverride || input;
    if (!text.trim()) return;
    
    // 如果正在处理中，阻止新的请求
    if (loading) {
      console.log("正在处理中，请稍候...");
      return;
    }

    const newMsgs = [...messages, { role: 'user', text }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', {
        message: text,
        schema_data: schema || {},
        has_character_image: !!characterImage // 告诉后端是否有角色图片
      });

      setSchema(res.data.schema);
      setMessages([...newMsgs, { role: 'ai', text: res.data.reply }]);

      if (res.data.is_ready) {
        generateImage(res.data.schema);
      }
    } catch (e) {
      console.error("Mock mode or Error:", e);
      // 模拟回复 (开发测试用，实际请删除)
      setTimeout(() => {
          setMessages(prev => [...prev, { role: 'ai', text: `收到，正在调整参数: ${text}...` }]);
          setLoading(false);
      }, 1000);
    } finally {
      setLoading(false);
    }
  };

  // 生成图片
  const generateImage = async (finalSchema) => {
    setGenerationError(false); // 重置错误状态
    setMessages(prev => [...prev, { role: 'ai', text: "📷 正在冲洗胶片..." }]);
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/generate', { 
        schema_data: finalSchema,
        character_image: characterImage, // Base64 图片
        camera_settings: {
            ...cameraSettings,
            model: selectedModel.name // 传递相机模型名称给后端
        }
      }, {
        timeout: 360000 // 6分钟超时（生成+水印处理需要较长时间）
      });
      setGeneratedImage(res.data.image_url);
      setMessages(prev => [...prev, { role: 'ai', text: "✨ 照片已生成！" }]);
    } catch (e) {
       console.error("Image generation failed:", e);
       setGenerationError(true); // 标记失败
       setMessages(prev => [...prev, { 
         role: 'ai', 
         text: "❌ 生成失败了，可能是网络超时或服务器繁忙。请重新描述需求或调整参数后再试。" 
       }]);
    } finally {
      setLoading(false);
    }
  };

  // 处理图片上传
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacterImage(reader.result);
        handleSend(`已上传角色图片：${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUIChange = (type, value) => {
    if (type === 'camera') {
      // value 是 camera model 对象 - 直接更新 schema
      setSelectedModel(value);
      setSchema(prev => ({
        ...prev,
        camera: {
          ...prev.camera,
          camera_style: value.name,
          film_stock: value.name,
          lens: value.type
        }
      }));
    } else if (type === 'location') {
      // 只设置临时位置，不发送消息
      setTempLocation(value);
    } else if (type === 'cameraSettings') {
      setCameraSettings(value);
      const promptMsg = `相机参数设置：光圈 ${value.aperture}, 快门 ${value.shutter}, ISO ${value.iso}`;
      console.log("Context:", promptMsg);
      handleSend(promptMsg);
    }
  };

  // 确认相机设置
  const handleConfirmCameraSettings = () => {
    setCameraSettings(tempCameraSettings);
    // 直接更新 schema，不发送消息
    setSchema(prev => ({
      ...prev,
      camera: {
        ...prev.camera,
        aperture: tempCameraSettings.aperture,
        shutter: tempCameraSettings.shutter,
        iso: tempCameraSettings.iso
      }
    }));
    setIsManualControlsOpen(false); // 确认后自动折叠
  };

  // 确认地点选择
  const handleConfirmLocation = () => {
    if (tempLocation) {
      setLocation(tempLocation);
      // 直接更新 schema，不发送消息
      const coordsString = `${tempLocation.lat.toFixed(4)}, ${tempLocation.lng.toFixed(4)}`;
      const locationName = selectedLocationName || 'Selected Location';
      
      setSchema(prev => ({
        ...prev,
        environment: {
          ...prev.environment,
          location_type: locationName,
          coordinates: coordsString
        }
      }));
      
      // 清除地点名称，为下次使用做准备
      setSelectedLocationName('');
      setIsLocationOpen(false); // 确认后自动折叠
    }
  };

  // 搜索地点（核心函数，不带防抖）
  const performSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    setSearchError('');
    
    try {
      // 方案1: 尝试使用 Photon API (通常更快更稳定)
      let response = await fetch(
        `https://photon.komoot.io/api/?` +
        `q=${encodeURIComponent(query)}&` +
        `limit=5&` +
        `lang=en`
      );
      
      if (!response.ok) {
        // 如果 Photon 失败，回退到 Nominatim
        console.log('Photon API 失败，尝试 Nominatim...');
        response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `format=json&` +
          `q=${encodeURIComponent(query)}&` +
          `limit=5&` +
          `addressdetails=1`,
          {
            headers: {
              'Accept': 'application/json',
            }
          }
        );
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('搜索结果:', data); // 调试用
      
      // 处理 Photon 或 Nominatim 的响应格式
      let results = [];
      if (data.features) {
        // Photon 格式
        results = data.features.map(feature => ({
          lat: feature.geometry.coordinates[1],
          lon: feature.geometry.coordinates[0],
          display_name: feature.properties.name + 
            (feature.properties.city ? `, ${feature.properties.city}` : '') +
            (feature.properties.country ? `, ${feature.properties.country}` : '')
        }));
      } else {
        // Nominatim 格式
        results = data;
      }
      
      setSearchResults(results);
      
      if (results.length === 0) {
        setSearchError('没有找到相关地点，请尝试其他关键词');
      }
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchError('搜索失败，请检查网络连接后重试');
    } finally {
      setIsSearching(false);
    }
  };

  // 防抖搜索（自动搜索，输入时触发）
  const debouncedSearch = (query) => {
    // 清除之前的定时器
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // 设置新的定时器
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 500); // 500ms 延迟
  };

  // 表单提交搜索（点击搜索按钮）
  const handleSearchLocation = async (e) => {
    e.preventDefault();
    // 清除防抖定时器，立即搜索
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    await performSearch(searchQuery);
  };

  // 选择搜索结果
  const handleSelectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setSearchLocation({ lat, lng });
    setTempLocation({ lat, lng });
    setSelectedLocationName(result.display_name); // 保存地点名称
    setSearchResults([]);
    setSearchQuery('');
  };

  // 辅助组件：滑块
  const SliderControl = ({ label, value, options, onChange }) => {
    const currentIndex = options.indexOf(value);
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center text-[10px] font-bold text-stone-500 uppercase tracking-wider">
          <span>{label}</span>
          <span className="text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100 font-mono">{value}</span>
        </div>
        <div className="relative h-8 flex items-center">
            <input 
                type="range" 
                min="0" 
                max={options.length - 1} 
                value={currentIndex === -1 ? 0 : currentIndex}
                onChange={(e) => onChange(options[Number(e.target.value)])}
                className="w-full absolute z-20 opacity-0 cursor-pointer h-full"
            />
            {/* 自定义轨道 */}
            <div className="w-full h-1 bg-stone-200 rounded-full relative z-10">
                {/* 刻度点 */}
                <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 flex justify-between px-1">
                     {options.map((_, i) => (
                        <div key={i} className={`w-1 h-1 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-teal-500 scale-150' : 'bg-stone-300'}`}></div>
                    ))}
                </div>
                {/* 滑块 Thumb (模拟) - 计算位置 */}
                <div 
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-[3px] border-teal-500 rounded-full shadow-md transition-all duration-200 pointer-events-none z-30"
                    style={{ left: `calc(${ (currentIndex / (options.length - 1)) * 100 }% - 8px)` }}
                ></div>
            </div>
        </div>
      </div>
    );
  };

  // 解析 ratio 字符串为数值
  const getAspectRatioValue = (ratioStr) => {
    const [w, h] = ratioStr.split('/').map(Number);
    return w / h;
  };

  return (
    <div className="flex h-screen bg-[#e7e5e4] text-stone-800 font-sans overflow-hidden">
      
      {/* --- 左侧控制面板 --- */}
      <div className="w-[380px] flex-shrink-0 bg-[#f5f5f4] border-r border-stone-300 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 relative">
        
        {/* Header */}
        <div className="p-5 border-b border-stone-200 bg-[#f5f5f4]/80 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-lg font-serif-display font-bold tracking-tight text-stone-900 flex items-center gap-2.5">
            <div className="bg-stone-900 text-white p-2 rounded-lg shadow-md">
                <Aperture size={18} />
            </div>
            <div className="flex flex-col">
                <span className="leading-none">Vibe Camera</span>
                <span className="text-[8px] font-sans font-medium text-stone-400 tracking-[0.15em] uppercase mt-0.5">Professional Studio</span>
            </div>
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide min-h-0">
            
            {/* 1. 角色图片上传 */}
            <div className="space-y-3">
                <label className="text-[11px] font-bold tracking-[0.2em] text-stone-400 uppercase flex items-center gap-1.5">
                    <User size={12} strokeWidth={2.5} /> Character
                </label>
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        group relative border-2 border-dashed rounded-2xl p-4 cursor-pointer transition-all duration-300 ease-out
                        ${characterImage 
                            ? 'border-teal-500/50 bg-teal-50/30' 
                            : 'border-stone-200 hover:border-teal-400 hover:bg-white hover:shadow-md bg-stone-50'
                        }
                    `}
                >
                    {characterImage ? (
                        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl shadow-sm group-hover:shadow-md transition-shadow">
                            <img src={characterImage} alt="Character" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCharacterImage(null);
                                }}
                                className="absolute top-2 right-2 bg-white/90 backdrop-blur text-stone-600 p-1.5 rounded-full shadow-sm hover:text-red-500 hover:bg-white transition-all opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-stone-400 group-hover:text-teal-600 transition-colors">
                            <div className="bg-white p-3 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform duration-300">
                                <Upload size={20} />
                            </div>
                            <span className="text-xs font-medium">Upload Reference Photo</span>
                        </div>
                    )}
                </div>
                <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="hidden"
                />
            </div>

            {/* 2. 相机型号选择 (Camera Model) */}
            <div className="space-y-1">
                <button 
                    onClick={() => setIsCameraMenuOpen(!isCameraMenuOpen)}
                    className="w-full flex items-center justify-between text-[11px] font-bold tracking-[0.2em] text-stone-400 uppercase py-2 hover:text-stone-600 transition-colors"
                >
                    <div className="flex items-center gap-1.5">
                        <Camera size={12} strokeWidth={2.5} /> Camera & Film
                    </div>
                    <div className="flex items-center gap-2">
                        {!isCameraMenuOpen && <span className="text-teal-600 normal-case tracking-normal font-medium bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">{selectedModel.name}</span>}
                        {isCameraMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </button>
                
                {isCameraMenuOpen && (
                    <div className="grid grid-cols-1 gap-2 animate-in slide-in-from-top-2 duration-200">
                        {CAMERA_MODELS.map(model => (
                        <button 
                            key={model.id}
                            onClick={() => {
                                handleUIChange('camera', model);
                                setIsCameraMenuOpen(false);
                            }}
                            className={`
                                flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all duration-200 border group
                                ${selectedModel.id === model.id 
                                    ? 'bg-stone-900 text-white border-stone-900 shadow-lg transform scale-[1.02]' 
                                    : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
                                }
                            `}
                        >
                            <div className="flex flex-col">
                                <span className="text-xs font-bold tracking-wide">{model.name}</span>
                                <span className={`text-[10px] font-mono mt-0.5 ${selectedModel.id === model.id ? 'text-stone-400' : 'text-stone-400 group-hover:text-stone-500'}`}>
                                    {model.type} • {model.ratio.replace('/', ':')}
                                </span>
                            </div>
                            {selectedModel.id === model.id && (
                                <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]"></div>
                            )}
                        </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. 相机参数设置 */}
            <div className="space-y-1">
                <button 
                    onClick={() => setIsManualControlsOpen(!isManualControlsOpen)}
                    className="w-full flex items-center justify-between text-[11px] font-bold tracking-[0.2em] text-stone-400 uppercase py-2 hover:text-stone-600 transition-colors"
                >
                    <div className="flex items-center gap-1.5">
                        <Settings size={12} strokeWidth={2.5} /> Manual Controls
                    </div>
                    <div className="flex items-center gap-2">
                        {!isManualControlsOpen && (
                            <span className="text-teal-600 normal-case tracking-normal font-medium bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 text-[10px]">
                                {tempCameraSettings.aperture} • {tempCameraSettings.shutter} • ISO {tempCameraSettings.iso}
                            </span>
                        )}
                        {isManualControlsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </button>
                
                {isManualControlsOpen && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <div className="bg-white rounded-2xl p-5 space-y-5 border border-stone-200 shadow-sm">
                            <SliderControl 
                                label="Aperture" 
                                value={tempCameraSettings.aperture} 
                                options={['f/1.4', 'f/1.8', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16']}
                                onChange={(v) => setTempCameraSettings({...tempCameraSettings, aperture: v})}
                            />
                            <SliderControl 
                                label="Shutter Speed" 
                                value={tempCameraSettings.shutter} 
                                options={['1/30', '1/60', '1/125', '1/250', '1/500', '1/1000', '1/2000']}
                                onChange={(v) => setTempCameraSettings({...tempCameraSettings, shutter: v})}
                            />
                            <SliderControl 
                                label="ISO" 
                                value={tempCameraSettings.iso} 
                                options={['100', '200', '400', '800', '1600', '3200']}
                                onChange={(v) => setTempCameraSettings({...tempCameraSettings, iso: v})}
                            />
                            {/* 确认按钮 */}
                            <button 
                                onClick={handleConfirmCameraSettings}
                                className="w-full bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold tracking-wide uppercase py-3 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={
                                    tempCameraSettings.aperture === cameraSettings.aperture && 
                                    tempCameraSettings.shutter === cameraSettings.shutter && 
                                    tempCameraSettings.iso === cameraSettings.iso
                                }
                            >
                                {tempCameraSettings.aperture === cameraSettings.aperture && 
                                 tempCameraSettings.shutter === cameraSettings.shutter && 
                                 tempCameraSettings.iso === cameraSettings.iso 
                                    ? 'No Changes' 
                                    : 'Apply Settings'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 4. 地点选择 */}
            <div className="space-y-1">
                <button 
                    onClick={() => setIsLocationOpen(!isLocationOpen)}
                    className="w-full flex items-center justify-between text-[11px] font-bold tracking-[0.2em] text-stone-400 uppercase py-2 hover:text-stone-600 transition-colors"
                >
                    <div className="flex items-center gap-1.5">
                        <MapPin size={12} strokeWidth={2.5} /> Location
                    </div>
                    <div className="flex items-center gap-2">
                        {!isLocationOpen && tempLocation && (
                            <span className="text-teal-600 normal-case tracking-normal font-medium bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 text-[10px]">
                                {tempLocation.lat.toFixed(2)}, {tempLocation.lng.toFixed(2)}
                            </span>
                        )}
                        {isLocationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </button>
                
                {isLocationOpen && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <div className="space-y-2">
                            {/* 搜索框 */}
                            <form onSubmit={handleSearchLocation} className="relative">
                                <div className="bg-white rounded-xl border border-stone-200 p-1 flex items-center gap-2 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 transition-all">
                                    <Search size={14} className="ml-2 text-stone-400" />
                                    <input 
                                        className="flex-1 bg-transparent px-2 py-1.5 text-stone-700 placeholder-stone-400 focus:outline-none text-xs font-medium"
                                        placeholder="搜索地点..."
                                        value={searchQuery}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setSearchQuery(value);
                                            setSearchError(''); // 清除错误信息
                                            // 自动搜索（带防抖）
                                            if (value.trim()) {
                                                debouncedSearch(value);
                                            } else {
                                                setSearchResults([]);
                                            }
                                        }}
                                    />
                                    <button 
                                        type="submit"
                                        className={`p-1.5 rounded-lg text-white transition-all shadow-sm text-xs px-3 ${
                                            isSearching ? 'bg-stone-300 cursor-not-allowed' : 'bg-teal-500 hover:bg-teal-600'
                                        }`}
                                        disabled={isSearching}
                                    >
                                        {isSearching ? '...' : '搜索'}
                                    </button>
                                </div>
                                
                                {/* 错误提示 */}
                                {searchError && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-red-50 rounded-xl border border-red-200 shadow-sm z-[2000] px-3 py-2">
                                        <div className="text-xs text-red-600">{searchError}</div>
                                    </div>
                                )}
                                
                                {/* 搜索结果下拉 */}
                                {searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg z-[2000] max-h-48 overflow-y-auto">
                                        {searchResults.map((result, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSelectSearchResult(result)}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-b-0"
                                            >
                                                <div className="font-medium text-stone-700">{result.display_name}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </form>
                            
                            <div className="rounded-2xl overflow-hidden aspect-square border border-stone-200 shadow-sm relative group grayscale hover:grayscale-0 transition-all duration-500">
                                <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: "100%", width: "100%" }}>
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                                    {searchLocation && <FlyToLocation lat={searchLocation.lat} lng={searchLocation.lng} />}
                                    <LocationMarker onLocationSelect={(latlng) => handleUIChange('location', latlng)} />
                                    {/* 显示已确认的位置 */}
                                    {location && <Marker position={location}></Marker>}
                                </MapContainer>
                                <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-[10px] font-mono font-medium text-stone-600 shadow-sm z-[1000] border border-stone-100 group-hover:scale-105 transition-transform">
                                    {tempLocation ? `${tempLocation.lat.toFixed(2)}, ${tempLocation.lng.toFixed(2)}` : 'Click to select'}
                                </div>
                            </div>
                            {/* 确认按钮 */}
                            {tempLocation && (
                                <button 
                                    onClick={handleConfirmLocation}
                                    className="w-full bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold tracking-wide uppercase py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-[1.02] active:scale-95"
                                >
                                    Confirm Location
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* 5. AI 对话框 */}
        <div className="h-[40%] p-6 border-t border-stone-200 bg-[#f5f5f4] flex flex-col z-30 relative shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
            <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <label className="text-[11px] font-bold tracking-[0.2em] text-stone-400 uppercase flex items-center gap-1.5">
                    <Send size={12} strokeWidth={2.5} /> AI Assistant
                </label>
                
                <div className="bg-white rounded-2xl border border-stone-200 flex flex-col shadow-sm overflow-hidden h-full">
                    {/* 消息历史 */}
                    <div 
                        ref={chatContainerRef}
                        className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50/50"
                    >
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed max-w-[85%] shadow-sm ${
                                    msg.role === 'user' 
                                    ? 'bg-stone-800 text-white rounded-br-none' 
                                    : 'bg-white text-stone-600 border border-stone-100 rounded-bl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white px-4 py-2 rounded-2xl rounded-bl-none text-stone-400 text-xs border border-stone-100 flex items-center gap-2 shadow-sm">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                        <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                        <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 输入框 */}
                    <div className="p-3 bg-white border-t border-stone-100">
                        <div className="bg-stone-50 rounded-xl border border-stone-200 p-1 flex items-center gap-2 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 transition-all">
                            <input 
                                className="flex-1 bg-transparent px-3 py-2 text-stone-700 placeholder-stone-400 focus:outline-none text-xs font-medium"
                                placeholder="描述画面感..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                            />
                            <button 
                                onClick={() => handleSend()}
                                className={`p-2 rounded-lg text-white transition-all shadow-sm ${
                                    loading ? 'bg-stone-300 cursor-not-allowed' : 'bg-teal-500 hover:bg-teal-600 hover:shadow-md transform active:scale-95'
                                }`}
                                disabled={loading}
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* --- 右侧：预览区域 --- */}
      <div className="flex-1 flex items-center justify-center bg-[#e7e5e4] p-4 md:p-20 relative overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute inset-0 opacity-50 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/50 via-transparent to-transparent"></div>
            </div>

            {/* 拟物化相机边框容器 - 根据 selectedModel.ratio 动态调整 aspect-ratio */}
            {/* 使用 style={{ aspectRatio: ... }} 实现动态比例 */}
            <div 
                className="relative rounded-[32px] flex flex-col overflow-hidden border border-white/10 z-10 camera-leather camera-shadow transition-all duration-500 ease-out"
                style={{ 
                    aspectRatio: selectedModel.ratio,
                    width: '100%',
                    maxWidth: `min(100%, calc((100vh - 10rem) * ${getAspectRatioValue(selectedModel.ratio)}))`, // 核心：限制最大宽度以防止高度溢出
                    maxHeight: 'calc(100vh - 10rem)' // 兜底限制
                }}
            >
                
                {/* 顶部状态栏 (模拟相机顶部屏幕) */}
                <div className="h-12 md:h-16 bg-[#111] flex items-center justify-between px-4 md:px-8 text-stone-400 border-b border-white/5 relative overflow-hidden shrink-0">
                    {/* 顶部光泽效果 */}
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

                    <div className="flex gap-2 md:gap-8 text-xs font-mono tracking-widest">
                        <span className="text-teal-400 font-bold px-2 py-1 bg-teal-900/20 rounded border border-teal-900/50 uppercase text-[10px] md:text-xs">{selectedModel.type}</span>
                        <div className="hidden md:flex gap-6 opacity-80 font-medium">
                            <span className="flex items-center gap-2"><span className="text-[#57534e]">SS</span> <span className="text-stone-200">{cameraSettings.shutter}</span></span>
                            <span className="flex items-center gap-2"><span className="text-[#57534e]">F</span> <span className="text-stone-200">{cameraSettings.aperture}</span></span>
                            <span className="flex items-center gap-2"><span className="text-[#57534e]">ISO</span> <span className="text-stone-200">{cameraSettings.iso}</span></span>
                        </div>
                    </div>
                    <div className="flex gap-2 md:gap-4 items-center">
                         {/* 胶卷过片 (刷新页面) */}
                         <button 
                            onClick={() => window.location.reload()}
                            className="group flex items-center gap-2 hover:bg-white/5 px-2 py-1 rounded transition-colors mr-1 md:mr-2"
                            title="Advance Film (New Session)"
                         >
                            <RefreshCw size={14} className="text-stone-500 group-hover:text-white transition-transform duration-700 ease-out group-hover:rotate-180" />
                            <span className="text-[10px] font-bold text-stone-600 group-hover:text-stone-400 uppercase tracking-wider hidden sm:block">Advance</span>
                         </button>

                         <div className="flex items-center gap-2 bg-[#1c1917] px-2 py-1 rounded border border-[#292524]">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-stone-300 font-mono">REC</span>
                         </div>
                         <div className="flex items-center gap-1.5 font-mono">
                             <Battery size={16} className="text-teal-500 md:w-[18px] md:h-[18px]" />
                             <span className="text-[10px] font-bold">100%</span>
                         </div>
                    </div>
                </div>

                {/* 核心取景区域 */}
                <div className="flex-1 relative bg-black overflow-hidden group cursor-crosshair">
                    {/* 镜头光晕层 */}
                    <div className="absolute inset-0 z-20 lens-flare opacity-30 pointer-events-none"></div>
                    
                    {/* 1. 生成的图片 or 等待状态 */}
                    {generatedImage ? (
                        <img src={generatedImage} alt="Viewfinder" className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-700" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[#44403c]">
                           <p className="font-mono tracking-[0.3em] text-xs uppercase opacity-60">Waiting for shutter...</p>
                        </div>
                    )}

                    {/* 2. 取景器 UI 叠加层 (网格线与对焦) */}
                    <div className="absolute inset-0 pointer-events-none">
                        {/* 三分线网格 (半透明) */}
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                            <div className="border-r border-b border-white/50"></div>
                            <div className="border-r border-b border-white/50"></div>
                            <div className="border-b border-white/50"></div>
                            <div className="border-r border-b border-white/50"></div>
                            <div className="border-r border-b border-white/50"></div>
                            <div className="border-b border-white/50"></div>
                            <div className="border-r border-white/50"></div>
                            <div className="border-r border-white/50"></div>
                            <div></div>
                        </div>

                        {/* 中心对焦框 */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-16 md:w-48 md:h-32 border border-white/30 transition-all duration-300 hover:border-white/60 hover:scale-110 pointer-events-auto">
                             <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white/80"></div>
                             <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 bg-white/80"></div>
                             <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white/80"></div>
                             <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white/80"></div>
                             
                             {/* 中心点 (已移除) */}
                             
                             {/* 虚拟水平仪 */}
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 md:w-24 h-[1px] bg-white/20"></div>
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 md:h-16 w-[1px] bg-white/20"></div>
                        </div>

                        {/* 四角裁切标记 - 移动端缩小边距 */}
                        <div className="absolute top-3 left-3 md:top-8 md:left-8 w-3 h-3 md:w-6 md:h-6 border-t border-l border-white/60 transition-all duration-300 group-hover:border-white group-hover:w-5 group-hover:h-5 md:group-hover:w-8 md:group-hover:h-8"></div>
                        <div className="absolute top-3 right-3 md:top-8 md:right-8 w-3 h-3 md:w-6 md:h-6 border-t border-r border-white/60 transition-all duration-300 group-hover:border-white group-hover:w-5 group-hover:h-5 md:group-hover:w-8 md:group-hover:h-8"></div>
                        <div className="absolute bottom-3 left-3 md:bottom-8 md:left-8 w-3 h-3 md:w-6 md:h-6 border-b border-l border-white/60 transition-all duration-300 group-hover:border-white group-hover:w-5 group-hover:h-5 md:group-hover:w-8 md:group-hover:h-8"></div>
                        <div className="absolute bottom-3 right-3 md:bottom-8 md:right-8 w-3 h-3 md:w-6 md:h-6 border-b border-r border-white/60 transition-all duration-300 group-hover:border-white group-hover:w-5 group-hover:h-5 md:group-hover:w-8 md:group-hover:h-8"></div>

                        {/* 参数叠加文字 - 移动端缩小字号与间距 */}
                        <div className="absolute bottom-4 left-4 md:bottom-10 md:left-10 font-mono text-[9px] md:text-xs drop-shadow-md z-30 transition-all duration-300 hover:scale-105 pointer-events-auto">
                             <div className="text-white/90 font-bold tracking-wider mb-0.5 md:mb-1.5 text-[10px] md:text-sm">{selectedModel.name}</div>
                             <div className="flex gap-1 md:gap-4 text-white/60 font-medium">
                                <span className="bg-black/20 px-1 md:px-1.5 rounded hover:bg-black/40 transition-colors cursor-pointer">EV +0.0</span>
                                <span className="bg-black/20 px-1 md:px-1.5 rounded hover:bg-black/40 transition-colors cursor-pointer">AWB</span>
                                <span className="bg-black/20 px-1 md:px-1.5 rounded hover:bg-black/40 transition-colors cursor-pointer">{location ? 'GPS ON' : 'GPS OFF'}</span>
                             </div>
                        </div>
                        
                        {/* 虚拟直方图 (静态装饰) - 移动端缩小 */}
                        <div className="absolute bottom-4 right-4 md:bottom-10 md:right-10 w-14 h-8 md:w-32 md:h-16 opacity-40 hover:opacity-70 transition-opacity duration-300 cursor-pointer pointer-events-auto">
                            <div className="flex items-end h-full gap-[1px] md:gap-[2px]">
                                {[20, 35, 40, 50, 45, 60, 75, 55, 40, 30, 25, 40, 60, 80, 70, 50, 30, 20, 10, 5].map((h, i) => (
                                    <div key={i} className="flex-1 bg-white rounded-t-sm" style={{height: `${h}%`}}></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
      </div>
    </div>
  );
}