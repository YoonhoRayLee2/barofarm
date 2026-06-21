const searchButton = document.getElementById('search-button');
const locationInput = document.getElementById('location-input');
const capacityInput = document.getElementById('capacity-input');
const resultMessage = document.getElementById('result-message');
const recommendationList = document.getElementById('recommendation-list');

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? '검색 중...' : '추천 받기';
}

function clearResults() {
  recommendationList.innerHTML = '';
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCategory(tags) {
  if (!tags) return '문화활동';
  const { amenity, tourism, leisure, sport } = tags;

  if (amenity === 'cinema') return '영화관';
  if (amenity === 'theatre' || amenity === 'arts_centre') return '극장/공연장';
  if (amenity === 'museum' || tourism === 'museum') return '박물관';
  if (amenity === 'library') return '도서관';
  if (tourism === 'gallery') return '갤러리';
  if (amenity === 'community_centre' || amenity === 'arts_centre') return '문화센터';
  if (amenity === 'bowling_alley') return '볼링';
  if (amenity === 'climbing_wall' || sport === 'climbing') return '클라이밍';
  if (amenity === 'fitness_centre' || leisure === 'fitness_station') return '피트니스';
  if (amenity === 'swimming_pool' || leisure === 'swimming_pool') return '수영장';
  if (leisure === 'escape_game' || amenity === 'escape_game') return '방탈출';
  if (leisure === 'park') return '공원';
  if (leisure === 'garden') return '정원/산책로';
  if (leisure === 'playground') return '놀이터';
  if (tourism === 'attraction' || tourism === 'viewpoint') return '관광지';
  if (tourism === 'theme_park') return '테마파크';
  if (amenity === 'cafe') return '카페';
  if (amenity === 'restaurant') return '식당';
  return '문화활동';
}

function estimateCapacity(category) {
  switch (category) {
    case '방탈출': return 8;
    case '볼링': return 6;
    case '클라이밍': return 10;
    case '피트니스': return 15;
    case '수영장': return 20;
    case '영화관': return 50;
    case '극장/공연장': return 100;
    case '박물관': return 30;
    case '도서관': return 50;
    case '갤러리': return 20;
    case '문화센터': return 30;
    case '카페': return 6;
    case '식당': return 8;
    case '공원': return 50;
    case '정원/산책로': return 20;
    case '놀이터': return 25;
    case '관광지': return 50;
    case '테마파크': return 100;
    default: return 10;
  }
}

function buildQuery(lat, lon) {
  return `
[out:json][timeout:25];
(
  node(around:2000,${lat},${lon})["amenity"~"cinema|theatre|museum|library|arts_centre|community_centre|fitness_centre|swimming_pool|bowling_alley|climbing_wall|restaurant|cafe"];
  way(around:2000,${lat},${lon})["amenity"~"cinema|theatre|museum|library|arts_centre|community_centre|fitness_centre|swimming_pool|bowling_alley|climbing_wall|restaurant|cafe"];
  relation(around:2000,${lat},${lon})["amenity"~"cinema|theatre|museum|library|arts_centre|community_centre|fitness_centre|swimming_pool|bowling_alley|climbing_wall|restaurant|cafe"];
  node(around:2000,${lat},${lon})["tourism"~"museum|gallery|attraction|theme_park|information|viewpoint"];
  way(around:2000,${lat},${lon})["tourism"~"museum|gallery|attraction|theme_park|information|viewpoint"];
  relation(around:2000,${lat},${lon})["tourism"~"museum|gallery|attraction|theme_park|information|viewpoint"];
  node(around:2000,${lat},${lon})["leisure"~"sports_centre|swimming_pool|park|fitness_station|escape_game|playground|garden"];
  way(around:2000,${lat},${lon})["leisure"~"sports_centre|swimming_pool|park|fitness_station|escape_game|playground|garden"];
  relation(around:2000,${lat},${lon})["leisure"~"sports_centre|swimming_pool|park|fitness_station|escape_game|playground|garden"];
);
out center;`;
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&accept-language=ko`;
  const response = await fetch(url, { headers: { 'User-Agent': 'barofarm-management/1.0' } });
  if (!response.ok) {
    throw new Error('지오코딩 API 요청에 실패했습니다.');
  }

  const results = await response.json();
  return results[0] || null;
}

async function fetchNearbyPlaces(lat, lon) {
  const url = 'https://overpass-api.de/api/interpreter';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(buildQuery(lat, lon))}`,
  });

  if (!response.ok) {
    throw new Error('장소 검색 API 요청에 실패했습니다.');
  }

  const json = await response.json();
  return json.elements.map((element) => {
    const latLng = element.type === 'node'
      ? { lat: element.lat, lon: element.lon }
      : element.center || { lat: null, lon: null };

    return {
      id: `${element.type}/${element.id}`,
      name: element.tags?.name || element.tags?.operator || '이름 없음',
      category: getCategory(element.tags),
      description: element.tags?.description || element.tags?.name || '현지 인기 액티비티입니다.',
      distanceKm: latLng.lat !== null ? getDistanceKm(lat, lon, latLng.lat, latLng.lon) : 0,
      capacity: estimateCapacity(getCategory(element.tags)),
      tags: element.tags || {},
    };
  });
}

function renderRecommendations(locationLabel, places, capacity) {
  clearResults();

  if (places.length === 0) {
    resultMessage.textContent = `${locationLabel} 근방 2km 이내에서 ${capacity}명 수용 가능한 장소를 찾을 수 없습니다.`;
    return;
  }

  resultMessage.textContent = `${locationLabel} 근방 2km 이내에서 ${capacity}명 수용 가능한 추천 장소 ${places.length}개를 찾았습니다.`;

  places.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'card';

    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.description}</p>
      <p><strong>카테고리:</strong> ${item.category} · <strong>거리:</strong> ${item.distanceKm.toFixed(1)}km · <strong>수용:</strong> ${item.capacity}명</p>
      <span class="badge">${item.category}</span>
    `;

    recommendationList.appendChild(card);
  });
}

async function handleSearch() {
  const locationValue = locationInput.value.trim();
  const capacityValue = Number(capacityInput.value) || 1;

  if (!locationValue) {
    resultMessage.textContent = '지역 또는 역명을 입력해 주세요.';
    clearResults();
    return;
  }

  setLoading(true);
  resultMessage.textContent = `${locationValue} 주변 장소를 검색 중입니다...`;
  clearResults();

  try {
    const geo = await geocode(locationValue);
    if (!geo) {
      resultMessage.textContent = '입력하신 위치를 찾을 수 없습니다. 다른 이름으로 다시 시도해 주세요.';
      return;
    }

    const places = await fetchNearbyPlaces(Number(geo.lat), Number(geo.lon));
    const filtered = places
      .filter((place) => place.distanceKm <= 2 && place.capacity >= capacityValue)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    renderRecommendations(geo.display_name, filtered, capacityValue);
  } catch (error) {
    console.error(error);
    resultMessage.textContent = '검색 중 오류가 발생했습니다. 다시 시도해 주세요.';
  } finally {
    setLoading(false);
  }
}

searchButton.addEventListener('click', handleSearch);
locationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSearch();
  }
});
capacityInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSearch();
  }
});
