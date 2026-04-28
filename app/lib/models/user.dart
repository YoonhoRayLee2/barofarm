import 'dart:convert';

class User {
  final String id;
  final String name;
  final String phone;

  const User({required this.id, required this.name, required this.phone});

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'].toString(),
        name: j['name'] as String,
        phone: j['phone'] as String,
      );

  String toJsonString() => jsonEncode({'id': id, 'name': name, 'phone': phone});

  static User fromJsonString(String s) => User.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
