import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

const AuthLayout = () => {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{headerShown:false}} />
    </>
  );
};

export default AuthLayout;

const styles = StyleSheet.create({});
