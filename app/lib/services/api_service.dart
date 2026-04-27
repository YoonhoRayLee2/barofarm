import 'package:dio/dio.dart';
import '../app_config.dart';
import '../models/auction.dart';
import '../models/user.dart';

class ApiService {
  static final ApiService _instance = ApiService._();
  factory ApiService() => _instance;
  ApiService._();

  final Dio _dio = Dio(BaseOptions(baseUrl: AppConfig.baseUrl));

  Future<User> createUser({
    required String name,
    required String phone,
    required String role,
  }) async {
    final res = await _dio.post('/api/users', data: {'name': name, 'phone': phone, 'role': role});
    return User.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<Auction>> getAuctions() async {
    final res = await _dio.get('/api/auctions');
    final list = res.data as List<dynamic>;
    return list.map((e) => Auction.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Auction> getAuction(String id) async {
    final res = await _dio.get('/api/auctions/$id');
    return Auction.fromJson(res.data as Map<String, dynamic>);
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
