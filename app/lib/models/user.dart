import 'dart:convert';

class User {
  final String id;
  final String name;
  final String phone;
  final String role; // 'seller' | 'buyer'

  const User({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'].toString(),
        name: j['name'] as String,
        phone: j['phone'] as String,
        role: j['role'] as String,
      );

  String toJsonString() =>
      jsonEncode({'id': id, 'name': name, 'phone': phone, 'role': role});

  static User fromJsonString(String s) => User.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
