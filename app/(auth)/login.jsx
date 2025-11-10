import { Text, View, TextInput, Pressable } from "react-native";
import { Styles } from "../../styles/loginStyles";
import { Link } from "expo-router";
import CustomView from "../../components/CustomView";
import Spacer from "../../components/Spacer";
import { useState } from "react";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const handleChange = (field) => (text) => {
    setForm((prev) => ({ ...prev, [field]: text }));
  };
  console.log(form);
  return (
    <CustomView style={Styles.container}>
      <Text style={Styles.title}>Log in to Saydle</Text>
      <View>
        <TextInput
          style={Styles.input}
          placeholder="Enter your email address"
          value={form.email}
          onChangeText={handleChange("email")}
        />
        <TextInput
          style={Styles.input}
          placeholder="Enter your password"
          secureTextEntry
          value={form.password}
          onChangeText={handleChange("password")}
        />
        <Pressable style={Styles.btn}>
          <Text style={Styles.btnText}>Login</Text>
        </Pressable>
      </View>
      <Spacer height={20} />
      <Link href="/">Dont have an account? Create one</Link>
    </CustomView>
  );
};

export default Login;
