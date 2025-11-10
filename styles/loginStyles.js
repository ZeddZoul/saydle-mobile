import { StyleSheet } from "react-native";

export const Styles = StyleSheet.create({
  container: {
    color: "red",
    flex:1
  },
  title: {
    fontWeight: "bold",
    fontSize: 24,
    marginBottom: 20
  },
  main: {
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    height: 40,
    minWidth: "80%",
    borderWidth: 1,
    padding: 10,
    marginVertical: 12,
    borderColor: "#C49EBB",
    borderRadius: 4
  },
  btn: {
    backgroundColor: "#FF6F61",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 12
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16
  }
  
})