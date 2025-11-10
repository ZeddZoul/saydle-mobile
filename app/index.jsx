
import { StyleSheet, Text, View, Image } from 'react-native'
import logo from "../assets/logo.png"
const Home = () => {
  return (
    <View style={styles.container }>
      <Image source={logo} style={styles.logo} />
      <Text>Welcome to saydle...</Text>
      <Text>Directly in your hands</Text>
      <Text>#FF6F61</Text>
    </View>
  )
}

export default Home

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    margin: "auto",
    justifyContent: "center"
  },
  logo: {
    si: "45",
    width: 90
  }
})