import { StyleSheet } from "react-native";

export const Styles = StyleSheet.create({
  // `color` and `textAlign` used to be set here; React Native ignores both on a
  // View, so they were doing nothing. Text colour belongs on the Text element.
  container: {
    flex: 1,
  },
  title: {
    fontWeight: "bold",
    fontSize: 24,
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    height: 46,
    minWidth: "80%",
    borderWidth: 1,
    paddingHorizontal: 12,
    marginVertical: 4,
    borderColor: "#C49EBB",
    borderRadius: 8,
  },
  btn: {
    backgroundColor: "#FF6F61",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  link: {
    color: "#FF6F61",
  },
});
