import 'package:dio/dio.dart';
import '../app_config.dart';
import '../models/auction.dart';
import '../models/live.dart';
import '../models/user.dart';

class ApiService {
  static final ApiService _instance = ApiService._();
  factory ApiService() => _instance;
  ApiService._();

  final Dio _dio = Dio(BaseOptions(baseUrl: AppConfig.baseUrl));

  Future<User> createUser({
    required String name,
    required String phone,
  }) async {
    final res = await _dio.post('/api/users', data: {'name': name, 'phone': phone});
    return User.fromJson(res.data as Map<String, dynamic>);
  }

  // ── Live ────────────────────────────────────────────────

  Future<List<Live>> getLives() async {
    final res = await _dio.get('/api/lives');
    final list = res.data as List<dynamic>;
    return list.map((e) => Live.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 응답: { id, sellerId, title, status, token, serverUrl }
  Future<Map<String, dynamic>> createLive({
    required String sellerId,
    required String title,
  }) async {
    final res = await _dio.post('/api/lives', data: {
      'sellerId': sellerId,
      'title': title,
    });
    return res.data as Map<String, dynamic>;
  }

  // ── Auction ─────────────────────────────────────────────

  Future<Auction> getAuction(String id) async {
    final res = await _dio.get('/api/auctions/$id');
    return Auction.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Auction> createAuction({
    required String liveId,
    required String productName,
    required int startPrice,
  }) async {
    final res = await _dio.post('/api/lives/$liveId/auctions', data: {
      'productName': productName,
      'startPrice': startPrice,
    });
    final id = (res.data as Map<String, dynamic>)['id'].toString();
    return getAuction(id);
  }

  Future<void> startAuction({
    required String liveId,
    required String auctionId,
  }) async {
    await _dio.patch('/api/lives/$liveId/auctions/$auctionId/start');
  }

  Future<Map<String, dynamic>> getToken({
    required String roomName,
    required String userId,
    required String role,
  }) async {
    final res = await _dio.post('/api/live/token', data: {
      'roomName': roomName,
      'userId': userId,
      'role': role,
    });
    return res.data as Map<String, dynamic>;
  }
}
